from .http import get_json, Throttle

_throttle = Throttle(1.1)  # Nominatim usage policy: max 1 request/second


async def search(q: str, limit: int = 5):
    await _throttle.wait()
    data = await get_json(
        "https://nominatim.openstreetmap.org/search",
        {"q": q, "format": "jsonv2", "addressdetails": 1, "limit": limit,
         "featuretype": "settlement", "accept-language": "en"},
        service="the OpenStreetMap geocoder",
    )
    out, seen = [], set()
    for d in data:
        a = d.get("address", {})
        name = d.get("name") or a.get("city") or a.get("town") or a.get("village") or d.get("display_name", "").split(",")[0]
        region = a.get("state") or a.get("region") or a.get("county") or ""
        country = a.get("country", "")
        key = (name, region, country)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "name": name, "region": region, "country": country,
            "country_code": (a.get("country_code") or "").lower(),
            "display_name": ", ".join(p for p in (name, region, country) if p),
            "lat": float(d["lat"]), "lon": float(d["lon"]),
        })
    return out


async def reverse(lat: float, lon: float):
    """Where is this coordinate? (country is needed to pick the right emergency numbers)."""
    await _throttle.wait()
    d = await get_json("https://nominatim.openstreetmap.org/reverse",
                       {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 10, "accept-language": "en"},
                       service="the OpenStreetMap geocoder")
    a = d.get("address", {}) if isinstance(d, dict) else {}
    name = a.get("city") or a.get("town") or a.get("village") or a.get("county") or a.get("state") or ""
    return {"name": name, "country": a.get("country", ""), "country_code": (a.get("country_code") or "").lower()}
