"""Optional Geoapify Places API (free tier key: https://www.geoapify.com/)."""
from __future__ import annotations
import httpx
from .. import config
from .http import client

# Map our categories → Geoapify category strings
CAT_MAP = {
    "restaurants": "catering.restaurant,catering.fast_food",
    "cafes": "catering.cafe,catering.bakery",
    "attractions": "tourism.sights,entertainment.museum,tourism.attraction",
    "shopping": "commercial.shopping_mall,commercial.marketplace,commercial.clothing",
    "useful": "service.financial.atm,healthcare.pharmacy,public_transport",
    "hidden": "tourism.sights,catering.restaurant,catering.cafe",
    "nightlife": "catering.bar,catering.pub,adult.nightclub",
    "nature": "leisure.park,natural,national_park",
    "hospitals": "healthcare.hospital",
    "pharmacies": "healthcare.pharmacy",
    "clinics": "healthcare.clinic_or_praxis",
    "police": "service.police",
}


async def search(category: str, lat: float, lon: float, radius: int, limit: int = 40):
    if not config.GEOAPIFY_API_KEY:
        return []
    cats = CAT_MAP.get(category)
    if not cats:
        return []
    r = await client().get(
        "https://api.geoapify.com/v2/places",
        params={
            "categories": cats,
            "filter": f"circle:{lon},{lat},{radius}",
            "bias": f"proximity:{lon},{lat}",
            "limit": min(limit, 50),
            "apiKey": config.GEOAPIFY_API_KEY,
        },
        timeout=httpx.Timeout(8.0, connect=3.0),
    )
    if r.status_code != 200:
        return []
    out = []
    for f in (r.json() or {}).get("features") or []:
        props = f.get("properties") or {}
        coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
        name = props.get("name") or props.get("address_line1")
        if not name or coords[0] is None:
            continue
        kind = (props.get("categories") or [category])[0].split(".")[-1].replace("_", " ").capitalize()
        out.append({
            "id": f"geoapify/{props.get('place_id') or props.get('osm_id') or name}",
            "name": name,
            "kind": kind,
            "lat": coords[1],
            "lon": coords[0],
            "address": props.get("formatted") or props.get("address_line1"),
            "opening_hours": props.get("opening_hours"),
            "phone": None,
            "email": None,
            "website": props.get("website"),
            "wheelchair": None,
            "osm_url": props.get("datasource", {}).get("raw", {}).get("osm_id")
                and f"https://www.openstreetmap.org/{props.get('datasource', {}).get('raw', {}).get('osm_type', 'node')}/{props['datasource']['raw']['osm_id']}"
                or f"https://www.openstreetmap.org/#map=17/{coords[1]:.5f}/{coords[0]:.5f}",
            "tags": {},
            "distance_km": None,
            "match": {"score": 0, "reasons": [], "cautions": [], "personalized": False},
            "source": "geoapify",
        })
    return out
