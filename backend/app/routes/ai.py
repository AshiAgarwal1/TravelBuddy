import asyncio
from fastapi import APIRouter, Query
from ..cache import get_or_set
from ..schemas import ChatRequest
from ..services import openrouter, weather, grounding, community
from .. import config

router = APIRouter(prefix="/api")

FRIEND = """You are TravelBuddy, a warm, well-travelled local friend for {place}.
Give practical, specific advice a local would give: neighbourhoods, how locals eat and get around, timing, etiquette, scams and tourist traps to avoid, safety and money tips.
Rules:
- Be honest. Never invent ratings, reviews, quotes, crowd levels or prices. Give rough ranges and call them estimates.
- If NEARBY_PLACES is provided, those are real OpenStreetMap entries. Prefer them when recommending a place, name them in bold, and explain WHY each fits THIS traveller using only the listed data (cuisine, diet tags, hours as mapped, distance, the 'fits' note) and the traveller's preferences. Say plainly when something is not mapped (for example, "no vegan info is mapped, so check the menu").
- A venue that is not in NEARBY_PLACES is an AI suggestion: only mention it if you are confident it exists, and label it "(AI suggestion, please verify)".
- Do not claim a place is currently open or busy. Hours are as mapped and may be outdated.
- SOURCE TAGS: after every sentence or bullet that states a fact about a place, price, rule, safety or custom, add a tag. Use [S#] only when that exact fact is in the numbered SOURCES below (map entries or community excerpts). Use [AI] for anything from your own general knowledge. Never put an [S#] tag on something the source does not say. Community excerpts are individuals' opinions: phrase them as "some travellers say", not as fact.
- Keep answers concise and easy to scan (short paragraphs or a few bullets). Stay focused on {place} and nearby.
{extra}"""


async def _weather_line(req):
    if req.lat is None or req.lon is None:
        return ""
    try:
        w = await asyncio.wait_for(get_or_set(f"wx:{round(req.lat, 2)}:{round(req.lon, 2)}", 600, lambda: weather.forecast(req.lat, req.lon), stale_ttl=3 * 3600), 5)
        c = w["current"]
        return f"Current weather there: {c['label']}, {c['temperature_2m']} degrees C. Use it when relevant."
    except Exception:
        return ""


async def _grounding(req):
    """Real places for this question. Fetches at most 2 categories, only when the question needs them."""
    if req.lat is None or req.lon is None:
        return {}
    last = req.messages[-1].content
    cats = grounding.categories_for(last)
    if not cats and req.prefs and req.prefs.interests and len(req.messages) <= 2:
        cats = [c for i in req.prefs.interests for c in grounding.INTEREST_TO_CATS.get(i.lower(), [])][:1]
    if not cats:
        # Nothing specific asked: reuse whatever is already cached (no new public-API calls).
        return await grounding.gather(req.lat, req.lon, ["restaurants", "attractions"], req.prefs, per_cat=5, fetch=False)
    return await grounding.gather(req.lat, req.lon, cats, req.prefs, per_cat=8, deadline=9.0)


async def _community_sources(city, country=""):
    from ..cache import get_or_set
    try:
        sources, _ = await asyncio.wait_for(
            get_or_set(f"commsrc4:{city}:{country}", lambda v: 6 * 3600 if v[0] else 300, lambda: community.gather(city, country), stale_ttl=86400), 8)
        return sources
    except Exception:
        return []


def _number_sources(groups, comm):
    """One numbering for everything the model may cite: mapped places first, then community excerpts."""
    out, n = [], 0
    for cat, ps in groups.items():
        for p in ps:
            n += 1
            out.append({"id": f"S{n}", "type": "osm", "title": p["name"], "url": p.get("osm_url"), "text": grounding.describe(p),
                        "meta": f"{p['kind']}, " + {"geoapify": "Geoapify", "opentripmap": "OpenTripMap"}.get(p.get("source"), "OpenStreetMap"), "place": p, "category": cat})
    for c in comm[:6]:
        n += 1
        out.append({**c, "id": f"S{n}"})
    return out


@router.post("/chat")
async def chat(req: ChatRequest):
    place = f"{req.city}, {req.country}" if req.country else req.city
    # Weather, places and community excerpts are independent: run together, none can block the AI call for long.
    wx, groups, comm = await asyncio.gather(_weather_line(req), _grounding(req), _community_sources(req.city, req.country))
    sources = _number_sources(groups, comm)
    block = ""
    if sources:
        lines = ["SOURCES (cite by id; map data may be outdated, community text is opinion):"]
        lines += [f"[{s['id']}] ({s['type']}) {s['text'] if s['type'] == 'osm' else s['title'] + ': ' + community._clip(s['text'], 420)}" for s in sources]
        block = "\n".join(lines)
    extra = "\n".join(x for x in (wx, grounding.prefs_summary(req.prefs), block) if x)
    msgs = [{"role": "system", "content": FRIEND.format(place=place, extra=extra)}]
    msgs += [m.model_dump() for m in req.messages[-12:]]
    reply = await openrouter.complete(msgs, max_tokens=900)
    reply = community.validate_tags(reply, {s["id"] for s in sources})
    cited = sorted({m.group(1) for m in community.TAG.finditer(reply) if m.group(1) != "AI"}, key=lambda x: int(x[1:]))
    pub = lambda s: {"id": s["id"], "type": s["type"], "title": s["title"], "url": s.get("url"), "meta": s.get("meta"),
                     "cited": s["id"] in cited}
    used = [{"id": s["place"]["id"], "name": s["place"]["name"], "kind": s["place"]["kind"], "category": s["category"],
             "distance_km": s["place"]["distance_km"], "lat": s["place"]["lat"], "lon": s["place"]["lon"],
             "address": s["place"].get("address"), "opening_hours": s["place"].get("opening_hours"), "source_id": s["id"]}
            for s in sources if s["type"] == "osm"]
    return {"reply": reply, "model": config.OPENROUTER_MODEL, "sources": [pub(s) for s in sources],
            "grounding": {"places": used, "source": "OpenStreetMap contributors", "personalized": bool(req.prefs and req.prefs.is_set())}}


@router.get("/insights")
async def insights(city: str, country: str = Query("")):
    place = f"{city}, {country}" if country else city
    prompt = f"""Give practical local information for a traveller in {place}. Reply with JSON only, no other text:
{{"opening_hours":[{{"what":"Typical shops","typical":"10:00-20:00"}}],"tips":["..."],"etiquette":["..."],"money":["..."],"getting_around":["..."]}}
Include 4-6 opening_hours entries (shops, restaurants, banks, museums, markets, pharmacies) with typical local patterns incl. weekly closures or siesta breaks if relevant. 4-5 short items for each list. Be accurate and general; do not name businesses."""
    async def load():
        raw = await openrouter.complete([{"role": "user", "content": prompt}], max_tokens=1200, temperature=0.4)
        return openrouter.parse_json(raw)
    data = await get_or_set(f"ins:{place}", 86400, load, stale_ttl=7 * 86400, persist=True)
    return {**data, "label": "AI-generated estimates. Verify locally before relying on them.", "model": config.OPENROUTER_MODEL}
