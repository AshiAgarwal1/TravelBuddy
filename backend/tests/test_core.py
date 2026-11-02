import asyncio
import pytest
from app import cache
from app.schemas import Prefs
from app.services import overpass, personalize, routing, grounding
from app.services.http import UpstreamError
from app.routes.trips import _attach_sources


def P(id, name, **tags):
    return {"id": id, "name": name, "kind": "Restaurant", "lat": 48.85, "lon": 2.35, "address": None,
            "opening_hours": tags.pop("opening_hours", None), "website": None, "phone": None, "tags": tags}


# ---------- cache ----------
def test_single_flight_shares_one_upstream_call():
    cache.clear()
    calls = {"n": 0}

    async def factory():
        calls["n"] += 1
        await asyncio.sleep(0.05)
        return {"ok": 1}

    async def run():
        return await asyncio.gather(*(cache.get_or_set("k", 60, factory) for _ in range(8)))
    out = asyncio.run(run())
    assert calls["n"] == 1 and all(o == {"ok": 1} for o in out)


def test_stale_value_served_when_refresh_fails():
    cache.clear()
    state = {"fail": False}

    async def factory():
        if state["fail"]:
            raise UpstreamError("down")
        return [1, 2, 3]

    async def run():
        await cache.fetch_cached("s", 0.01, factory, stale_ttl=60)
        await asyncio.sleep(0.05)
        state["fail"] = True
        return await cache.fetch_cached("s", 0.01, factory, stale_ttl=60)
    r = asyncio.run(run())
    assert r.stale and r.value == [1, 2, 3]


def test_errors_are_not_cached():
    cache.clear()
    n = {"n": 0}

    async def factory():
        n["n"] += 1
        raise UpstreamError("boom")

    async def run():
        for _ in range(2):
            with pytest.raises(UpstreamError):
                await cache.get_or_set("e", 60, factory)
    asyncio.run(run())
    assert n["n"] == 2


# ---------- overpass parsing ----------
def test_parse_skips_unnamed_dedupes_and_keeps_only_mapped_data():
    data = {"elements": [
        {"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {"name": "A", "amenity": "restaurant", "diet:vegan": "yes"}},
        {"type": "node", "id": 2, "lat": 1.0, "lon": 2.0, "tags": {"name": "A", "amenity": "restaurant"}},  # duplicate
        {"type": "node", "id": 3, "lat": 1.0, "lon": 2.0, "tags": {"amenity": "restaurant"}},               # no name
        {"type": "way", "id": 4, "center": {"lat": 3.0, "lon": 4.0}, "tags": {"name": "B", "tourism": "museum"}},
        {"type": "node", "id": 5, "tags": {"name": "C"}},                                                   # no coordinates
    ]}
    out = overpass.parse(data)
    assert [p["name"] for p in out] == ["A", "B"]
    assert out[0]["tags"]["diet:vegan"] == "yes" and out[0]["opening_hours"] is None and out[1]["lat"] == 3.0


# ---------- personalization ----------
def test_diet_match_ranks_first_and_unknown_is_not_invented():
    prefs = Prefs(diet=["vegan"])
    veg = P("n/1", "Green", amenity="restaurant", **{"diet:vegan": "yes"})
    unk = P("n/2", "Plain", amenity="restaurant")
    no = P("n/3", "Steak", amenity="restaurant", **{"diet:vegan": "no"})
    r = personalize.rank([unk, no, veg], prefs, (48.85, 2.35))
    assert [p["name"] for p in r] == ["Green", "Plain", "Steak"]
    assert "vegan" in r[0]["match"]["reasons"][0]["text"]
    assert r[1]["match"]["reasons"] == [] and r[1]["match"]["cautions"]   # honest: "not mapped"
    assert r[2]["match"]["cautions"]


def test_no_prefs_still_works_and_flags_not_personalized():
    r = personalize.rank([P("n/1", "X", amenity="cafe")], None, (48.85, 2.35))
    assert r[0]["match"]["personalized"] is False


def test_step_free_and_interest_reasons():
    prefs = Prefs(step_free=True, interests=["Art and museums"])
    p = P("n/1", "Museum", tourism="museum", wheelchair="yes")
    m = personalize.score(p, prefs, 0.5)
    texts = " ".join(r["text"] for r in m["reasons"])
    assert "wheelchair" in texts and "art and museums" in texts


# ---------- grounding ----------
def test_category_keywords():
    assert grounding.categories_for("Where can I get vegetarian dinner and a good coffee?")[:2] == ["restaurants", "cafes"]
    assert grounding.categories_for("How do I get around?") == []


def test_trip_items_never_take_coordinates_from_ai():
    groups = {"attractions": [{**P("node/9", "Real Museum", tourism="museum"), "distance_km": 1.0,
                               "match": {"reasons": [{"text": "x", "source": "osm"}], "cautions": []}}]}
    plan = {"days": [{"day": 1, "items": [
        {"title": "Visit", "ref": "node/9", "lat": 0, "lon": 0},
        {"title": "Made up place", "ref": "node/404", "lat": 12.3, "lon": 45.6},
        {"title": "No ref"}]}]}
    out = _attach_sources(plan, groups)["days"][0]["items"]
    assert out[0]["source"] == "osm" and out[0]["title"] == "Real Museum" and out[0]["place"]["lat"] == 48.85
    assert out[1]["source"] == "ai" and "lat" not in out[1] and "place" not in out[1]
    assert out[2]["source"] == "ai"


# ---------- routing ----------
class _Resp:
    status_code = 200
    def __init__(self, d): self.d = d
    def raise_for_status(self): pass
    def json(self): return self.d


def test_route_uses_service_geometry_and_labels_estimates(monkeypatch):
    class C:
        async def get(self, url, **kw):
            return _Resp({"code": "Ok", "routes": [{"distance": 2400, "duration": 1, "geometry": {"coordinates": [[2.0, 48.0], [2.01, 48.01]]}}]})
    monkeypatch.setattr(routing, "client", lambda: C())
    r = asyncio.run(routing.route("foot", 48.0, 2.0, 48.01, 2.01))
    assert r["points"] == [[48.0, 2.0], [48.01, 2.01]] and r["duration_is_estimate"] and r["duration_s"] == 1800


def test_route_refuses_far_destinations():
    with pytest.raises(UpstreamError):
        asyncio.run(routing.route("foot", 48.0, 2.0, 50.0, 5.0))


# ---------- API: Local Help independence ----------
def _patch_overpass(monkeypatch, failing=()):
    async def fake(lat, lon, filters, radius, limit=60):
        if any(f in failing for f in filters):
            raise UpstreamError("The OpenStreetMap places service is busy right now. Try again in a moment.", "Overpass")
        return [P("node/1", "Place", amenity="x")]
    monkeypatch.setattr(overpass, "query", fake)


def test_help_returns_partial_results_when_one_category_fails(client, monkeypatch):
    _patch_overpass(monkeypatch, failing=overpass.HELP["pharmacies"])
    r = client.get("/api/help", params={"lat": 28.6, "lon": 77.2, "country_code": "in"})
    assert r.status_code == 200
    j = r.json()
    assert set(j["groups"]) == {"hospitals", "clinics", "police"} and "pharmacies" in j["errors"] and j["partial"]
    assert j["emergency_numbers"]["general"] == "112"


def test_emergency_numbers_do_not_touch_overpass(client, monkeypatch):
    async def boom(*a, **k): raise AssertionError("Overpass must not be called")
    monkeypatch.setattr(overpass, "query", boom)
    r = client.get("/api/help/numbers", params={"country_code": "gb"})
    assert r.status_code == 200 and r.json()["emergency_numbers"]["general"].startswith("999")


def test_single_category_failure_is_a_readable_502_only_for_that_category(client, monkeypatch):
    _patch_overpass(monkeypatch, failing=overpass.HELP["police"])
    ok = client.get("/api/help/places", params={"lat": 1, "lon": 1, "category": "hospitals"})
    bad = client.get("/api/help/places", params={"lat": 1, "lon": 1, "category": "police"})
    assert ok.status_code == 200 and bad.status_code == 502 and "busy" in bad.json()["detail"]


def test_second_request_is_served_from_cache(client, monkeypatch):
    n = {"n": 0}

    async def fake(lat, lon, filters, radius, limit=60):
        n["n"] += 1
        return [P("node/1", "Place", amenity="restaurant")]
    monkeypatch.setattr(overpass, "query", fake)
    for _ in range(3):
        assert client.get("/api/places", params={"lat": 1, "lon": 1, "category": "restaurants"}).status_code == 200
    assert n["n"] == 1


def test_places_with_prefs_does_not_requery_upstream(client, monkeypatch):
    n = {"n": 0}

    async def fake(lat, lon, filters, radius, limit=60):
        n["n"] += 1
        return [P("node/1", "V", amenity="restaurant", **{"diet:vegan": "yes"})]
    monkeypatch.setattr(overpass, "query", fake)
    client.get("/api/places", params={"lat": 2, "lon": 2, "category": "restaurants"})
    r = client.get("/api/places", params={"lat": 2, "lon": 2, "category": "restaurants", "prefs": '{"diet":["vegan"]}'})
    assert n["n"] == 1 and r.json()["places"][0]["match"]["reasons"]
    assert client.get("/api/places", params={"lat": 2, "lon": 2, "prefs": "not json"}).status_code == 400


# ---------- community: citations and images ----------
def test_invalid_source_tags_become_ai():
    from app.services import community
    out = community.validate_tags("Metro is cheap [S1]. Cafes close early [S9]. Tip jar [AI].", {"S1", "S2"})
    assert out == "Metro is cheap [S1]. Cafes close early [AI]. Tip jar [AI]."


def test_summary_drops_points_without_valid_sources(monkeypatch):
    from app.services import community, openrouter

    async def fake(*a, **k):
        return ('{"points":[{"topic":"Food","text":"Locals eat late.","sources":["S1"]},'
                '{"topic":"Safety","text":"Invented.","sources":["S7"]},'
                '{"topic":"Other","text":"No source.","sources":[]}],"caveat":"thin"}')
    monkeypatch.setattr(openrouter, "complete", fake)
    srcs = [{"id": "S1", "type": "reddit", "title": "t", "text": "x"}]
    res = asyncio.run(community.summarize("Lisbon", srcs))
    assert [p["text"] for p in res["points"]] == ["Locals eat late."]


def _mock_web(monkeypatch, handler):
    import httpx
    from app.services import http
    monkeypatch.setattr(http, "_client", httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True))


def test_wiki_summary_falls_back_to_action_api(monkeypatch):
    import httpx
    from app.services import wiki

    def handler(req):
        if "rest_v1" in req.url.path:
            return httpx.Response(500)
        return httpx.Response(200, json={"query": {"pages": [{
            "title": "Agra", "extract": "Agra is a city.", "fullurl": "https://en.wikipedia.org/wiki/Agra",
            }]}})
    _mock_web(monkeypatch, handler)
    s = asyncio.run(wiki.summary("Agra"))
    assert s["title"] == "Agra" and "image" not in s and s["url"].endswith("/Agra")


def test_community_gathers_reddit_and_wikivoyage(monkeypatch):
    import httpx
    from app.services import community
    WV = ("Agra is home to the Taj Mahal and plenty of history for visitors.\n== Understand ==\n" + "Old city of the Mughal empire. " * 6 +
          "\n== Stay safe ==\n" + "Watch for touts near the monuments and agree prices first. " * 3 + "\n== Eat ==\nShort.\n")

    def handler(req):
        host, path, q = req.url.host, req.url.path, dict(req.url.params)
        if host == "en.wikivoyage.org":
            return httpx.Response(200, json={"query": {"pages": [{"title": "Agra", "fullurl": "https://en.wikivoyage.org/wiki/Agra", "extract": WV}]}})
        if host == "arctic-shift.photon-reddit.com" and path.endswith("/posts/search"):
            if q["subreddit"] == "travel":
                return httpx.Response(200, json={"data": [
                    {"id": "a1", "title": "Agra in 2 days?", "selftext": "Visiting Agra in March", "score": 50, "num_comments": 20, "subreddit": "travel", "permalink": "/r/travel/comments/a1/x/"},
                    {"id": "a2", "title": "Unrelated", "selftext": "nothing here", "score": 99, "num_comments": 99, "subreddit": "travel"},
                    {"id": "a3", "title": "Agra removed", "selftext": "[removed]", "score": 5, "num_comments": 9, "subreddit": "travel"}]})
            return httpx.Response(404)
        if host == "arctic-shift.photon-reddit.com" and path.endswith("/comments/search"):
            return httpx.Response(200, json={"data": [{"body": "Go at sunrise, the queues are short and it is cooler.", "score": 12, "author": "u1"}]})
        return httpx.Response(404)
    _mock_web(monkeypatch, handler)
    sources, note = asyncio.run(community.gather("Agra", "India"))
    assert {s["type"] for s in sources} == {"wikivoyage", "reddit"}
    assert [s["id"] for s in sources] == [f"S{i}" for i in range(1, len(sources) + 1)]
    rd = [s for s in sources if s["type"] == "reddit"]
    assert len(rd) == 1 and rd[0]["url"].startswith("https://www.reddit.com/r/travel/comments/a1")
    assert [s["title"].split(", ")[-1] for s in sources if s["type"] == "wikivoyage"] == ["Overview", "Understand", "Stay safe"]
    assert note is None


def test_community_survives_every_source_failing(monkeypatch):
    import httpx
    from app.services import community
    _mock_web(monkeypatch, lambda req: httpx.Response(403))
    assert asyncio.run(community.gather("Agra", "India")) == ([], None)




def test_places_clean_drops_invalid_and_duplicates():
    from app.services import places
    out = places.clean([
        {"id": "a", "name": "Cafe X", "lat": 10.0, "lon": 20.0},
        {"id": "b", "name": "cafe x", "lat": 10.0004, "lon": 20.0004},   # same place, other id
        {"id": "a", "name": "Dup id", "lat": 11, "lon": 21},
        {"id": "c", "name": "  ", "lat": 1, "lon": 1},
        {"id": "d", "name": "Bad", "lat": 999, "lon": 1},
        {"id": "e", "name": "No coords", "lat": None, "lon": 1},
        {"id": "f", "name": "Cafe X", "lat": 10.5, "lon": 20.5},          # same name, far away: kept
    ])
    assert [p["id"] for p in out] == ["a", "f"]


def test_featured_and_image_endpoints_are_gone(client):
    assert client.get("/api/featured").status_code == 404
    assert client.get("/api/img", params={"u": "https://upload.wikimedia.org/x.jpg"}).status_code == 404
