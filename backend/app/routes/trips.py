from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import Trip
from ..schemas import TripRequest, TripUpdate, TripOut
from ..services import openrouter, grounding

router = APIRouter(prefix="/api/trips")

SCHEMA = """{"title":"string","summary":"string","days":[{"day":1,"theme":"string","items":[{"time":"09:00","title":"string","ref":"id from NEARBY_PLACES or null","why":"one sentence on why this fits this traveller","description":"1-2 sentences","area":"neighbourhood","est_cost":"approximate, local currency or Free"}]}],"tips":["string"]}"""

INTEREST_CATS = {"Food": ["restaurants", "cafes"], "History": ["attractions"], "Art and museums": ["attractions"],
                 "Nature": ["nature"], "Nightlife": ["nightlife"], "Shopping": ["shopping"], "Architecture": ["attractions"],
                 "Local culture": ["hidden", "attractions"], "Photography": ["attractions"], "Wellness": []}


def _categories(interests):
    cats = ["attractions", "restaurants", "cafes"]
    for i in interests:
        for c in INTEREST_CATS.get(i, []):
            if c not in cats:
                cats.append(c)
    return cats[:5]


def _attach_sources(plan, groups):
    """Items that cite a real place id get that place's mapped data; everything else is labelled an AI suggestion.
    Coordinates are NEVER taken from the model."""
    index = {p["id"]: p for ps in groups.values() for p in ps}
    for day in plan.get("days", []):
        for it in day.get("items", []):
            ref = it.pop("ref", None)
            for k in ("lat", "lon", "latitude", "longitude"):
                it.pop(k, None)
            p = index.get(ref) if ref else None
            if p:
                it["source"] = "osm"
                it["title"] = p["name"]
                it["place"] = {k: p.get(k) for k in ("id", "name", "kind", "lat", "lon", "address", "opening_hours", "website", "phone", "osm_url", "distance_km")}
                it["reasons"] = p["match"]["reasons"]
                it["cautions"] = p["match"]["cautions"]
            else:
                it["source"] = "ai"
    return plan


@router.post("/generate", response_model=TripOut)
async def generate(req: TripRequest, db: Session = Depends(get_db)):
    place = f"{req.city}, {req.country}" if req.country else req.city
    prefs = req.prefs
    groups = {}
    if req.lat is not None and req.lon is not None:
        groups = await grounding.gather(req.lat, req.lon, _categories(req.interests), prefs, per_cat=12, deadline=14.0)
    prompt = f"""Create a {req.days}-day itinerary for {place}.
Budget: {req.budget}. Travelling as: {req.group}. Interests: {', '.join(req.interests) or 'general sightseeing'}.
{grounding.prefs_summary(prefs)}
{('Extra notes: ' + req.notes) if req.notes else ''}
{grounding.prompt_block(groups)}
Group nearby places each day to limit travel time, include 4-6 items per day with realistic times, mix famous sights with local spots, and avoid tourist traps.
When NEARBY_PLACES is provided, build the plan mainly from those real entries and copy their ref exactly; their hours are only as mapped, so do not claim they are open. Any item NOT from the list must have "ref": null and only name venues you are confident exist.
For every item write a one-sentence "why" tied to this traveller's preferences or the place's mapped details. Never invent ratings, reviews or crowd levels. Costs are rough estimates. Do not claim opening hours.
Reply with JSON only matching exactly this shape: {SCHEMA}"""
    raw = await openrouter.complete([{"role": "user", "content": prompt}], max_tokens=3800, temperature=0.6, timeout=100)
    plan = openrouter.parse_json(raw)
    if not isinstance(plan.get("days"), list) or not plan["days"]:
        raise HTTPException(502, "The AI did not return a usable itinerary. Please try again.")
    plan = _attach_sources(plan, groups)
    plan["meta"] = {"grounded_places": sum(len(v) for v in groups.values()), "personalized": bool(prefs and prefs.is_set())}
    trip = Trip(city=req.city, country=req.country, lat=req.lat, lon=req.lon, days=req.days, budget=req.budget,
                group=req.group, interests=req.interests, title=plan.get("title") or f"{req.days} days in {req.city}", plan=plan)
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return trip


@router.get("", response_model=list[TripOut])
def list_trips(db: Session = Depends(get_db)):
    return db.scalars(select(Trip).order_by(Trip.updated_at.desc())).all()


def _get(db, trip_id):
    t = db.get(Trip, trip_id)
    if not t:
        raise HTTPException(404, "Trip not found")
    return t


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db)):
    return _get(db, trip_id)


@router.put("/{trip_id}", response_model=TripOut)
def update_trip(trip_id: int, body: TripUpdate, db: Session = Depends(get_db)):
    t = _get(db, trip_id)
    t.title, t.plan = body.title, body.plan
    t.days = len(body.plan.get("days", [])) or t.days
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, trip_id))
    db.commit()
