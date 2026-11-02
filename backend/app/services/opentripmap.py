"""Optional OpenTripMap API (free key: https://opentripmap.io/product)."""
from __future__ import annotations
import httpx
from .. import config
from .http import client

# kinds accepted by OpenTripMap
CAT_MAP = {
    "restaurants": "restaurants,foods",
    "cafes": "cafes",
    "attractions": "interesting_places,museums,historic,architecture",
    "shopping": "shops,malls",
    "useful": "banks,atm,tourist_facilities",
    "hidden": "interesting_places",
    "nightlife": "bars,pubs,nightclubs",
    "nature": "natural,gardens_and_parks",
    "hospitals": "other",
    "pharmacies": "other",
    "clinics": "other",
    "police": "other",
}


async def search(category: str, lat: float, lon: float, radius: int, limit: int = 40):
    if not config.OPENTRIPMAP_API_KEY or category in ("hospitals", "pharmacies", "clinics", "police"):
        return []  # no reliable healthcare/police data: better empty than wrong
    kinds = CAT_MAP.get(category, "interesting_places")
    r = await client().get(
        "https://api.opentripmap.com/0.1/en/places/radius",
        params={
            "radius": min(radius, 15000),
            "lon": lon,
            "lat": lat,
            "kinds": kinds,
            "limit": min(limit, 50),
            "rate": 2,
            "format": "json",
            "apikey": config.OPENTRIPMAP_API_KEY,
        },
        timeout=httpx.Timeout(8.0, connect=3.0),
    )
    if r.status_code != 200:
        return []
    out = []
    for p in r.json() or []:
        name = p.get("name")
        if not name:
            continue
        out.append({
            "id": f"otm/{p.get('xid') or name}",
            "name": name,
            "kind": (p.get("kinds") or category).split(",")[0].replace("_", " ").capitalize(),
            "lat": p.get("point", {}).get("lat") or p.get("lat"),
            "lon": p.get("point", {}).get("lon") or p.get("lon"),
            "address": None,
            "opening_hours": None,
            "phone": None,
            "email": None,
            "website": None,
            "wheelchair": None,
            "osm_url": f"https://www.openstreetmap.org/#map=17/{p.get('point', {}).get('lat', lat):.5f}/{p.get('point', {}).get('lon', lon):.5f}",
            "tags": {},
            "distance_km": round((p.get("dist") or 0) / 1000, 2) if p.get("dist") is not None else None,
            "match": {"score": 0, "reasons": [], "cautions": [], "personalized": False},
            "source": "opentripmap",
        })
    return [x for x in out if x["lat"] is not None and x["lon"] is not None]
