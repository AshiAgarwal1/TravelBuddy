"""Overpass (OpenStreetMap) access: one small query per category, bounded concurrency, mirror fallback."""
import asyncio
import math
import time
import httpx
from .. import config
from .http import client, UpstreamError

CATEGORIES = {
    "restaurants": ['["amenity"="restaurant"]'],
    "cafes": ['["amenity"~"^(cafe|bakery)$"]', '["shop"="bakery"]'],
    "attractions": ['["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]', '["historic"~"^(monument|castle|ruins|memorial|archaeological_site)$"]'],
    "shopping": ['["shop"~"^(mall|department_store|books|clothes|craft|gift|antiques)$"]', '["amenity"="marketplace"]'],
    "useful": ['["amenity"~"^(pharmacy|atm|toilets|post_office|drinking_water)$"]', '["tourism"="information"]'],
    "hidden": ['["tourism"~"^(viewpoint|gallery|artwork)$"][!"wikidata"][!"brand"]',
               '["amenity"~"^(cafe|bar|restaurant)$"]["cuisine"][!"wikidata"][!"brand"][!"operator"]["opening_hours"]["website"]'],
    "nightlife": ['["amenity"~"^(bar|pub|nightclub|biergarten)$"]'],
    "nature": ['["leisure"~"^(park|garden|nature_reserve)$"]', '["natural"~"^(peak|beach|waterfall)$"]'],
}

HELP = {
    "hospitals": ['["amenity"="hospital"]', '["healthcare"="hospital"]'],
    "pharmacies": ['["amenity"="pharmacy"]'],
    "clinics": ['["amenity"~"^(clinic|doctors)$"]'],
    "police": ['["amenity"="police"]'],
}

ALL = {**CATEGORIES, **HELP}

# Tags we pass through to the client (small, display/ranking-relevant). Everything shown is "as mapped".
TAG_KEYS = ("amenity", "tourism", "historic", "shop", "leisure", "natural", "cuisine", "brand", "operator", "wikidata",
            "wikipedia", "outdoor_seating", "takeaway", "delivery", "internet_access", "wheelchair", "fee", "charge",
            "healthcare", "emergency", "start_date", "stars")

_sem: asyncio.Semaphore | None = None
_cooldown: dict[str, float] = {}   # mirror -> monotonic time until which we avoid it


def _semaphore():
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(config.OVERPASS_MAX_CONCURRENCY)
    return _sem


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))


def _label(t):
    for k in ("cuisine", "amenity", "tourism", "shop", "historic", "leisure", "natural"):
        if t.get(k):
            return t[k].replace("_", " ").replace(";", ", ").capitalize()
    return "Place"


def build_query(lat, lon, filters, radius, cap=300):
    parts = "".join(f"nwr{f}[\"name\"](around:{radius},{lat},{lon});" for f in filters)
    return f"[out:json][timeout:20];({parts});out center tags {cap};"


def parse(data, limit=60):
    """Overpass JSON -> unique, named places with coordinates. Never fills in anything that is not mapped."""
    places, seen = [], set()
    for el in data.get("elements", []):
        t = el.get("tags", {})
        plat = el.get("lat") if el.get("lat") is not None else el.get("center", {}).get("lat")
        plon = el.get("lon") if el.get("lon") is not None else el.get("center", {}).get("lon")
        if plat is None or plon is None or not t.get("name"):
            continue
        key = (t["name"].lower(), round(plat, 3), round(plon, 3))
        if key in seen:
            continue
        seen.add(key)
        addr = " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x)
        tags = {k: t[k] for k in TAG_KEYS if t.get(k)}
        tags.update({k: v for k, v in t.items() if k.startswith("diet:") and v in ("yes", "only", "no", "limited")})
        places.append({
            "id": f"{el['type']}/{el['id']}", "name": t["name"], "kind": _label(t),
            "lat": plat, "lon": plon,
            "address": ", ".join(x for x in (addr, t.get("addr:city", "")) if x) or None,
            "opening_hours": t.get("opening_hours"),
            "website": t.get("website") or t.get("contact:website"),
            "phone": t.get("phone") or t.get("contact:phone"),
            "email": t.get("email") or t.get("contact:email"),
            "wheelchair": t.get("wheelchair"),
            "description": t.get("description"),
            "tags": tags,
            "osm_url": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
        })
    return places


async def _post(url, q):
    async with _semaphore():
        return await client().post(url, data={"data": q}, timeout=httpx.Timeout(config.OVERPASS_READ_TIMEOUT, connect=4.0))


async def _try_mirror(url, q, limit):
    """Return parsed places or raise."""
    r = await _post(url, q)
    if r.status_code == 200:
        data = r.json()
        if data.get("elements") or not str(data.get("remark", "")).startswith("runtime error"):
            return parse(data, limit)
        _cooldown[url] = time.monotonic() + 30
        raise UpstreamError("overloaded", "Overpass")
    if r.status_code in (429, 504):
        _cooldown[url] = time.monotonic() + (60 if r.status_code == 429 else 30)
        raise UpstreamError("busy", "Overpass")
    _cooldown[url] = time.monotonic() + 30
    raise UpstreamError(f"error {r.status_code}", "Overpass")


async def query(lat, lon, filters, radius, limit=60):
    """Race several Overpass mirrors; first successful response wins."""
    q = build_query(lat, lon, filters, radius)
    now = time.monotonic()
    mirrors = [m for m in config.OVERPASS_MIRRORS if _cooldown.get(m, 0) <= now] or list(config.OVERPASS_MIRRORS)
    mirrors = mirrors[:4]

    async def one(url):
        try:
            return await _try_mirror(url, q, limit)
        except Exception as e:
            return e

    # Fire in parallel; take first real list
    tasks = [asyncio.create_task(one(u)) for u in mirrors]
    try:
        for fut in asyncio.as_completed(tasks, timeout=config.OVERPASS_READ_TIMEOUT + 2):
            try:
                res = await fut
            except Exception as e:
                res = e
            if isinstance(res, list):
                for t in tasks:
                    t.cancel()
                return res
    except asyncio.TimeoutError:
        pass
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()

    raise UpstreamError("The OpenStreetMap places service is slow or unreachable right now. Try again in a moment.", "Overpass")
