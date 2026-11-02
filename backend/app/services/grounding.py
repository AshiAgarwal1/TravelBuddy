"""Gives the AI real, retrieved places to talk about, so recommendations are not invented lists."""
import asyncio
import re
from ..schemas import Prefs
from . import personalize, places

KEYWORDS = {
    "restaurants": r"\b(eat|eating|food|restaurant|dinner|lunch|meal|hungry|vegetarian|vegan|halal|local dish|cuisine)\b",
    "cafes": r"\b(cafe|café|coffee|breakfast|brunch|bakery|pastry|tea)\b",
    "attractions": r"\b(see|visit|sight|museum|attraction|history|historic|monument|landmark|view|do in|things to do|art)\b",
    "hidden": r"\b(hidden|gem|local favou?rite|off the beaten|authentic|tourist trap|locals? go)\b",
    "nightlife": r"\b(bar|pub|drink|nightlife|night out|club)\b",
    "nature": r"\b(park|garden|nature|hike|walk|beach|outdoor)\b",
}
INTEREST_TO_CATS = {"food": ["restaurants", "cafes"], "history": ["attractions"], "art and museums": ["attractions"],
                    "nature": ["nature"], "nightlife": ["nightlife"], "local culture": ["hidden", "attractions"],
                    "architecture": ["attractions"], "photography": ["attractions"]}


def categories_for(text: str, limit=2):
    t = text.lower()
    found = [c for c, rx in KEYWORDS.items() if re.search(rx, t)]
    return found[:limit]


async def gather(lat, lon, cats, prefs: Prefs | None, radius=4000, per_cat=8, deadline=9.0, fetch=True):
    """Fetch (or peek at) places for the given categories concurrently. Failures are skipped silently."""
    async def one(cat):
        try:
            if fetch:
                res = await asyncio.wait_for(places.get_places(cat, lat, lon, radius), deadline)
                items = res.value
            else:
                items = await places.peek_places(cat, lat, lon, radius)
            if not items:
                return cat, []
            ranked = personalize.rank(items, prefs, (lat, lon))
            return cat, ranked[:per_cat]
        except Exception:
            return cat, []
    results = await asyncio.gather(*(one(c) for c in cats))
    return {c: ps for c, ps in results if ps}


def describe(place, with_reasons=True):
    t = place.get("tags", {})
    bits = [f"ref={place['id']}", place["name"], place["kind"]]
    if place.get("distance_km") is not None:
        bits.append(f"{place['distance_km']} km from centre")
    if place.get("opening_hours"):
        bits.append(f"hours(as mapped): {place['opening_hours']}")
    diets = [k.split(":")[1] for k, v in t.items() if k.startswith("diet:") and v in ("yes", "only")]
    if diets:
        bits.append("diet(mapped): " + "/".join(diets))
    if t.get("cuisine"):
        bits.append(f"cuisine: {t['cuisine']}")
    if t.get("wheelchair"):
        bits.append(f"wheelchair: {t['wheelchair']}")
    if t.get("fee"):
        bits.append(f"fee: {t['fee']}")
    if with_reasons and place.get("match", {}).get("reasons"):
        bits.append("fits: " + "; ".join(r["text"] for r in place["match"]["reasons"][:2]))
    return " | ".join(bits)


def prompt_block(groups: dict) -> str:
    if not groups:
        return ""
    lines = ["NEARBY_PLACES (real OpenStreetMap entries, already ranked for this traveller; data is as mapped and may be outdated):"]
    for cat, ps in groups.items():
        lines.append(f"[{cat}]")
        lines += [f"- {describe(p)}" for p in ps]
    return "\n".join(lines)


def prefs_summary(prefs: Prefs | None) -> str:
    if not prefs or not prefs.is_set():
        return ""
    parts = []
    if prefs.companions: parts.append(f"travelling: {prefs.companions}")
    if prefs.budget: parts.append(f"budget: {prefs.budget}")
    if prefs.diet: parts.append("diet: " + ", ".join(prefs.diet))
    if prefs.cuisines: parts.append("likes cuisines: " + ", ".join(prefs.cuisines))
    if prefs.interests: parts.append("interests: " + ", ".join(prefs.interests))
    if prefs.pace: parts.append(f"pace: {prefs.pace}")
    if prefs.approach: parts.append({"local": "prefers local, independent spots", "classic": "prefers well-known highlights", "mixed": "mix of local and highlights"}[prefs.approach])
    if prefs.step_free: parts.append("needs step-free access")
    return "TRAVELLER PREFERENCES: " + "; ".join(parts)
