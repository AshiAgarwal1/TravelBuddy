import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
CONTACT_EMAIL = os.getenv("CONTACT_EMAIL", "").strip()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./travelbuddy.db")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
# Optional fallback place APIs, used only when Overpass fails
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY", "").strip()
OPENTRIPMAP_API_KEY = os.getenv("OPENTRIPMAP_API_KEY", "").strip()
USER_AGENT = "TravelBuddy/1.0" + (f" ({CONTACT_EMAIL})" if CONTACT_EMAIL else "")

# --- Upstream tuning (all optional) ---
OVERPASS_MIRRORS = [m.strip() for m in os.getenv(
    "OVERPASS_MIRRORS",
    "https://overpass-api.de/api/interpreter,"
    "https://overpass.private.coffee/api/interpreter,"
    "https://overpass.kumi.systems/api/interpreter,"
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
).split(",") if m.strip()]
OVERPASS_MAX_CONCURRENCY = int(os.getenv("OVERPASS_MAX_CONCURRENCY", "3"))
OVERPASS_READ_TIMEOUT = float(os.getenv("OVERPASS_READ_TIMEOUT", "9"))

ROUTING_URLS = {
    "foot": os.getenv("ROUTING_FOOT_URL", "https://routing.openstreetmap.de/routed-foot/route/v1/driving/"),
    "bike": os.getenv("ROUTING_BIKE_URL", "https://routing.openstreetmap.de/routed-bike/route/v1/driving/"),
    "car": os.getenv("ROUTING_CAR_URL", "https://routing.openstreetmap.de/routed-car/route/v1/driving/"),
}
ROUTE_MAX_KM = float(os.getenv("ROUTE_MAX_KM", "30"))
