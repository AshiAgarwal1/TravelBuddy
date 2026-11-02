import json
from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError
from ..cache import get_or_set
from ..schemas import Prefs
from ..services import community, geocoding, overpass, personalize, places, routing, weather, wiki, emergency
from .. import config

router = APIRouter(prefix="/api")

OSM_SOURCE = "OpenStreetMap contributors (Overpass API)"
SOURCE_LABEL = {"osm": "OpenStreetMap contributors", "geoapify": "Geoapify Places", "opentripmap": "OpenTripMap"}
DAY = 86400


def _prefs(raw):
    if not raw:
        return None
    try:
        return Prefs.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        raise HTTPException(400, "Could not read the preferences sent with this request.")


async def _category_response(category, groups, lat, lon, radius, origin_lat, origin_lon, sort, prefs_raw, limit=60):
    """One category, independently. Cached and ranked per request; a failure affects only this category."""
    if category not in groups:
        raise HTTPException(400, "Unknown category")
    res = await places.get_places(category, lat, lon, radius, limit)
    origin = (origin_lat if origin_lat is not None else lat, origin_lon if origin_lon is not None else lon)
    items = personalize.rank(res.value, _prefs(prefs_raw), origin, sort)
    srcs = {p.get("source", "osm") for p in items}
    source = OSM_SOURCE if srcs <= {"osm"} else " + ".join(SOURCE_LABEL.get(x, x) for x in sorted(srcs)) + " (fallback place provider, not the Overpass API)"
    return {"category": category, "count": len(items), "places": items, "source": source,
            "stale": res.stale, "cached": res.cached, "age_s": res.age_s,
            "origin": {"lat": origin[0], "lon": origin[1]}}


@router.get("/health")
async def health():
    return {"ok": True, "ai_configured": bool(config.OPENROUTER_API_KEY), "model": config.OPENROUTER_MODEL}


@router.get("/geocode")
async def geocode(q: str = Query(min_length=2, max_length=100)):
    return await get_or_set(f"geo:{q.strip().lower()}", 7 * DAY, lambda: geocoding.search(q.strip()), stale_ttl=30 * DAY, persist=True)


@router.get("/reverse")
async def reverse(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    return await get_or_set(f"rev:{round(lat, 2)}:{round(lon, 2)}", 30 * DAY, lambda: geocoding.reverse(lat, lon), persist=True)


@router.get("/city")
async def city(name: str, region: str = ""):
    s = await get_or_set(f"city4:{name}:{region}", lambda v: DAY if v else 300, lambda: wiki.city_summary(name, region), stale_ttl=7 * DAY)
    if not s:
        return {"title": name, "extract": None, "url": None}
    return s


@router.get("/places")
async def get_places(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), category: str = "restaurants",
                     radius: int = Query(4000, ge=500, le=15000),
                     origin_lat: float | None = None, origin_lon: float | None = None,
                     sort: str = Query("match", pattern="^(match|distance)$"), prefs: str | None = None):
    return await _category_response(category, overpass.CATEGORIES, lat, lon, radius, origin_lat, origin_lon, sort, prefs)


@router.get("/weather")
async def get_weather(lat: float, lon: float):
    return await get_or_set(f"wx:{round(lat, 2)}:{round(lon, 2)}", 600, lambda: weather.forecast(lat, lon), stale_ttl=3 * 3600)


# ---- Local Help: numbers and each category are independent ------------------------------------

def _numbers(country_code: str):
    return {"emergency_numbers": emergency.lookup(country_code), "country_code": country_code.lower(),
            "source": "Static reference list in TravelBuddy (does not depend on any online service)"}


@router.get("/help/numbers")
async def help_numbers(country_code: str = ""):
    return _numbers(country_code)


@router.get("/help/places")
async def help_places(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), category: str = "hospitals",
                      radius: int = Query(6000, ge=1000, le=20000),
                      origin_lat: float | None = None, origin_lon: float | None = None):
    return await _category_response(category, overpass.HELP, lat, lon, radius, origin_lat, origin_lon, "distance", None, limit=25)


# ---- Directions (explicit user action only) ---------------------------------------------------

@router.get("/route")
async def get_route(from_lat: float = Query(ge=-90, le=90), from_lon: float = Query(ge=-180, le=180),
                    to_lat: float = Query(ge=-90, le=90), to_lon: float = Query(ge=-180, le=180),
                    mode: str = Query("foot", pattern="^(foot|bike|car)$")):
    key = f"route:{mode}:{from_lat:.4f},{from_lon:.4f}:{to_lat:.5f},{to_lon:.5f}"
    return await get_or_set(key, DAY, lambda: routing.route(mode, from_lat, from_lon, to_lat, to_lon))


# ---- Community --------------------------------------------------------------------------------

@router.get("/community")
async def community_route(city: str, country: str = ""):
    """Links to real Reddit threads and the Wikivoyage guide. Nothing is summarised or generated."""
    sources, note = await get_or_set(f"commsrc4:{city}:{country}", lambda v: 6 * 3600 if v[0] else 300,
                                     lambda: community.gather(city, country), stale_ttl=DAY)
    return {"sources": sources, "note": note}
