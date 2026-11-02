"""Rule-based, explainable ranking of real OSM places against traveller preferences.

Every reason is derived from a mapped tag or an explicit preference. Nothing is invented: if OSM
has no data that connects a place to a preference, the place simply gets no reason for it.
"""
from ..schemas import Prefs
from .overpass import km

DIET_TAG = {"vegetarian": "diet:vegetarian", "vegan": "diet:vegan", "halal": "diet:halal",
            "kosher": "diet:kosher", "gluten-free": "diet:gluten_free"}
FOOD_AMENITIES = {"restaurant", "cafe", "fast_food", "food_court", "bar", "pub", "biergarten", "bakery"}

INTEREST_RULES = {
    "food": lambda t: t.get("amenity") in FOOD_AMENITIES or t.get("shop") == "bakery" or t.get("amenity") == "marketplace",
    "history": lambda t: bool(t.get("historic")),
    "art and museums": lambda t: t.get("tourism") in {"museum", "gallery", "artwork"},
    "nature": lambda t: t.get("leisure") in {"park", "garden", "nature_reserve"} or bool(t.get("natural")) or t.get("tourism") == "viewpoint",
    "nightlife": lambda t: t.get("amenity") in {"bar", "pub", "nightclub", "biergarten"},
    "shopping": lambda t: bool(t.get("shop")) or t.get("amenity") == "marketplace",
    "architecture": lambda t: t.get("historic") in {"castle", "monument", "ruins"} or (t.get("tourism") == "attraction" and bool(t.get("wikidata"))),
    "local culture": lambda t: t.get("amenity") in {"marketplace", "theatre", "arts_centre"} or t.get("tourism") in {"gallery", "artwork", "museum"},
    "photography": lambda t: t.get("tourism") in {"viewpoint", "attraction", "artwork"},
    "wellness": lambda t: t.get("leisure") in {"spa", "sauna", "fitness_centre"} or t.get("shop") == "massage",
}


def _kind_word(t):
    return (t.get("amenity") or t.get("tourism") or t.get("historic") or t.get("leisure") or t.get("shop") or "place").replace("_", " ")


def score(place, prefs: Prefs | None, distance_km):
    """Return {score, reasons:[{text,source}], cautions:[str], personalized}. Sources: 'osm' (mapped data) or 'pref'."""
    t = place.get("tags", {})
    prefs = prefs or Prefs()
    s, reasons, cautions = 0.0, [], []
    is_food = t.get("amenity") in FOOD_AMENITIES

    def add(weight, text, source="osm"):
        nonlocal s
        s += weight
        reasons.append((weight, {"text": text, "source": source}))

    if is_food:
        for d in prefs.diet:
            tag = DIET_TAG.get(d.lower())
            val = t.get(tag) if tag else None
            if val == "only":
                add(5, f"Mapped as {d}-only (OpenStreetMap {tag}=only)")
            elif val == "yes":
                add(4, f"Mapped as serving {d} food ({tag}=yes)")
            elif val == "limited":
                add(1, f"Mapped with limited {d} options")
            elif val == "no":
                s -= 4
                cautions.append(f"Mapped as not serving {d} food")
            elif tag:
                cautions.append(f"No {d} information is mapped here. Check the menu")
        cuisine = [c.strip().lower() for c in t.get("cuisine", "").replace(",", ";").split(";") if c.strip()]
        for want in (c.strip().lower() for c in prefs.cuisines if c.strip()):
            hit = next((c for c in cuisine if want in c or c in want), None)
            if hit:
                add(3, f"Cuisine is mapped as {hit.replace('_', ' ')}, which you like", "pref")
                break

    hits = 0
    for interest in prefs.interests:
        rule = INTEREST_RULES.get(interest.lower())
        if rule and rule(t) and hits < 2:
            hits += 1
            add(2, f"Matches your interest in {interest.lower()} (mapped as {_kind_word(t)})", "pref")

    independent = not t.get("brand") and not t.get("wikidata") and not t.get("operator")
    if prefs.approach == "local" and independent:
        add(1.5, "Independent: no chain brand is mapped", "pref")
    elif prefs.approach == "classic" and (t.get("wikidata") or t.get("wikipedia")):
        add(2, "Well documented: it has a Wikipedia/Wikidata entry", "pref")

    if prefs.budget == "budget" and t.get("fee") == "no":
        add(2, "Free to enter (fee=no)")
    if t.get("charge") and t.get("fee") != "no":
        reasons.append((0.1, {"text": f"Entry charge as mapped: {t['charge']}", "source": "osm"}))

    if prefs.step_free:
        w = t.get("wheelchair")
        if w == "yes":
            add(3, "Mapped as wheelchair accessible")
        elif w == "limited":
            add(1, "Mapped as partly wheelchair accessible")
        elif w == "no":
            s -= 5
            cautions.append("Mapped as not wheelchair accessible")
        else:
            cautions.append("Step-free access is not mapped. Check before you go")

    if distance_km is not None:
        if prefs.pace == "relaxed":
            s += max(0.0, 2 - distance_km) * 0.5
            if distance_km <= 1:
                reasons.append((1, {"text": f"Close by ({distance_km:.1f} km), good for a relaxed pace", "source": "pref"}))
        s -= distance_km * 0.1

    if t.get("outdoor_seating") == "yes":
        add(0.5, "Outdoor seating is mapped")
    if place.get("opening_hours"):
        add(0.5, "Opening hours are mapped, so you can plan around them")
    s += 0.25 * sum(1 for k in ("website", "phone") if place.get(k))

    reasons.sort(key=lambda r: -r[0])
    return {"score": round(s, 2), "reasons": [r for _, r in reasons[:4]], "cautions": cautions[:3], "personalized": prefs.is_set()}


def rank(places, prefs: Prefs | None, origin, sort="match"):
    """Copy places, add distance from `origin` (lat, lon) and a `match` block, and sort."""
    out = []
    for p in places:
        d = round(km(origin[0], origin[1], p["lat"], p["lon"]), 2) if origin else None
        out.append({**p, "distance_km": d, "match": score(p, prefs, d)})
    if sort == "distance":
        out.sort(key=lambda p: (p["distance_km"] is None, p["distance_km"] or 0))
    else:
        out.sort(key=lambda p: (-p["match"]["score"], p["distance_km"] or 0))
    return out
