"""Places: OpenStreetMap Overpass first, then Geoapify, then OpenTripMap (the last two need free keys).
Every place carries a `source` so the UI never labels fallback data as OpenStreetMap.
There is no invented/built-in data: if every source fails, the error or stale cache is surfaced."""
from __future__ import annotations
import asyncio
import logging
import time
from ..cache import fetch_cached, Cached, _mem
from . import overpass, geoapify, opentripmap

log = logging.getLogger("travelbuddy.places")

TTL = 6 * 3600
STALE = 14 * 86400
OVERPASS_DEADLINE = 11.0
OVERPASS_COOLDOWN = 300.0       # after a failure, skip Overpass for 5 min so fallbacks answer immediately
_overpass_down_until = 0.0


def clean(items):
    """Drop entries without a usable name/coordinates and collapse duplicates (same id, or same name within ~100 m)."""
    out, ids, seen = [], set(), []
    for p in items or []:
        name = (p.get("name") or "").strip()
        lat, lon = p.get("lat"), p.get("lon")
        if not name or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        if p.get("id") in ids:
            continue
        nm = name.lower()
        if any(n == nm and abs(la - lat) < 0.001 and abs(lo - lon) < 0.001 for n, la, lo in seen):
            continue
        ids.add(p.get("id"))
        seen.append((nm, lat, lon))
        p["name"] = name
        out.append(p)
    return out


def snap(v):
    return round(v * 500) / 500


async def get_places(category: str, lat: float, lon: float, radius: int, limit: int = 60) -> Cached:
    filters = overpass.ALL.get(category)
    qlat, qlon = snap(lat), snap(lon)
    key = f"places:{category}:{qlat}:{qlon}:{radius}"

    async def load():
        global _overpass_down_until
        err = None
        if filters and time.monotonic() >= _overpass_down_until:
            try:
                result = await asyncio.wait_for(overpass.query(qlat, qlon, filters, radius, limit), timeout=OVERPASS_DEADLINE)
                if result:
                    for p in result:
                        p.setdefault("source", "osm")
                    result = clean(result)
                    if result:
                        return result
            except Exception as e:
                err = e
                _overpass_down_until = time.monotonic() + OVERPASS_COOLDOWN
                log.warning("Overpass failed for %s @ %.3f,%.3f: %s", category, qlat, qlon, e)
        for name, mod in (("Geoapify", geoapify), ("OpenTripMap", opentripmap)):
            try:
                result = clean(await mod.search(category, lat, lon, radius, limit))
                if result:
                    log.info("%s served %d places for %s", name, len(result), category)
                    return result
            except Exception as e:
                log.warning("%s failed: %s", name, e)
        if err:
            raise err
        return []

    return await fetch_cached(key, lambda v: TTL if v else 300, load, stale_ttl=STALE, persist=True)


async def peek_places(category: str, lat: float, lon: float, radius: int):
    e = _mem.get(f"places:{category}:{snap(lat)}:{snap(lon)}:{radius}")
    return e[3] if e and e[2] > time.time() else None
