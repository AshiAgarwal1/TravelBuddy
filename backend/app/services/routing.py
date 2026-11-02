"""Directions via a free OSRM-compatible server. Called only on an explicit user action; results are cached.

Geometry, distance and (for car) duration come straight from the routing service. Walking/cycling durations
are derived from the routed distance at fixed speeds and labelled as estimates. Nothing is made up: on any
failure the caller gets an error and the UI falls back to an external directions link.
"""
import httpx
from .. import config
from .http import client, Throttle, UpstreamError
from .overpass import km

_throttle = Throttle(1.0)   # be gentle with the community servers
SPEEDS_KMH = {"foot": 4.8, "bike": 15.0}


async def route(mode, from_lat, from_lon, to_lat, to_lon):
    base = config.ROUTING_URLS.get(mode)
    if not base:
        raise UpstreamError("Unknown travel mode.", "routing")
    if km(from_lat, from_lon, to_lat, to_lon) > config.ROUTE_MAX_KM:
        raise UpstreamError(f"That place is more than {config.ROUTE_MAX_KM:.0f} km away, too far to draw a route here.", "routing")
    url = f"{base}{from_lon:.6f},{from_lat:.6f};{to_lon:.6f},{to_lat:.6f}"
    await _throttle.wait()
    try:
        r = await client().get(url, params={"overview": "full", "geometries": "geojson", "steps": "false"},
                               timeout=httpx.Timeout(10.0, connect=4.0))
        r.raise_for_status()
        d = r.json()
    except httpx.TimeoutException:
        raise UpstreamError("The routing service took too long to respond.", "routing")
    except (httpx.HTTPError, ValueError):
        raise UpstreamError("The routing service is unavailable right now.", "routing")
    if d.get("code") != "Ok" or not d.get("routes"):
        raise UpstreamError("No route could be found between these two points.", "routing")
    best = d["routes"][0]
    dist_m = float(best["distance"])
    duration = float(best["duration"]) if mode == "car" else dist_m / 1000 / SPEEDS_KMH[mode] * 3600
    return {
        "mode": mode, "distance_m": round(dist_m), "duration_s": round(duration),
        "duration_is_estimate": mode != "car",
        "points": [[lat, lon] for lon, lat in best["geometry"]["coordinates"]],
        "source": "OSRM routing on OpenStreetMap data (routing.openstreetmap.de)",
    }
