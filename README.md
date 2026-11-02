# TravelBuddy: Your Local Friend, Anywhere You Go

React + Vite frontend, FastAPI backend, SQLite (SQLAlchemy).

| Feature | Data source | Key needed |
|---|---|---|
| City search | OpenStreetMap Nominatim | No |
| Explore, Local Help (places, map) | OpenStreetMap Overpass + map tiles | No |
| Places fallback (only if Overpass fails) | Geoapify, then OpenTripMap | Optional free keys |
| Routes (walk / cycle / drive) | OSRM on OpenStreetMap data (routing.openstreetmap.de), only on click | No |
| Weather | Open-Meteo | No |
| City summaries (text only) | Wikipedia REST / Action API | No |
| Translator | MyMemory (voice via browser Web Speech API) | No |
| Community | Links to Reddit threads (free Arctic Shift archive) and the Wikivoyage guide, plus ready-made search links | No |
| Local Friend, Trip Planner, Insights | OpenRouter | **OPENROUTER_API_KEY** |

Without an OpenRouter key the app still runs; AI features show a clear "AI is not configured" message.

## Windows setup

Prerequisites: Python 3.10+, Node.js 18+.

```powershell
# 1. Environment file (project root)
copy .env.example .env
# edit .env and set OPENROUTER_API_KEY (https://openrouter.ai/keys)

# 2. Backend (terminal 1)
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend (terminal 2)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port 8000.
API docs: http://localhost:8000/docs

## Structure

```
backend/app/
  main.py config.py database.py models.py schemas.py cache.py
  routes/    geo.py (search, places, weather, help, route, community)  ai.py (chat, insights)  trips.py  tools.py
  services/  overpass places personalize grounding community routing geocoding weather wiki emergency translate openrouter http
backend/tests/          pytest suite (cache, Overpass parsing, ranking, Local Help independence, routing)
frontend/src/
  pages/ components/ services/api.js hooks/ lib/ context/ styles.css
frontend/tests/         node test for the API client (dedupe, cancellation, caching)
```

## What changed in this version

**Performance and reliability**
- The API client (`services/api.js`) shares identical in-flight GETs, caches responses briefly, and cancels requests when a page, city or tab changes. React StrictMode no longer causes duplicate calls.
- The backend cache (`cache.py`) is single-flight (concurrent identical requests make one upstream call), serves stale data if a refresh fails, never caches errors, and persists place lists in SQLite so restarts do not re-query Overpass. Places are cached for 6 hours per category and area.
- Overpass: one small query per category, bounded concurrency (`OVERPASS_MAX_CONCURRENCY`, default 3), a hard overall deadline of about 11 s, mirror fallback, and mirrors that fail are skipped for a while. Nominatim calls are throttled to 1 per second. Wikipedia, Reddit and weather have short timeouts, and independent lookups (for example Wikivoyage and Reddit) run in parallel.
- Pages are lazy-loaded; the first bundle dropped from 514 kB to 170 kB.

**Local Help**
- `GET /api/help/numbers` is static and never touches Overpass.
- `GET /api/help/places?category=` loads one category, only when its tab is opened. A failure affects only that tab and shows a readable message and a retry button.
- If you are far from the selected city, help is searched around your real location and the country is looked up from it.

**Map**
- Numbered markers match the list numbers. Selecting either highlights the other, opens the popup and centres the map. The map fits all results, shows your location and accuracy when you allow it (city-centre fallback), has fit and locate buttons, and uses click-to-zoom so the page can still scroll. On phones there is a List/Map toggle and a details panel under the map.
- Routes (`GET /api/route`) use the free FOSSGIS OSRM servers. They are requested only when you press "Show route", only from your real location, cached, throttled to 1 per second and limited to 30 km. If routing fails you get a message and an "Open in Maps" link, never an invented route. Walking and cycling times are estimated from the routed distance (4.8 and 15 km/h) and labelled as estimates.

**Personalisation**
- "My style" (header button) stores budget, food needs, cuisines, interests, pace, local-vs-highlights approach, group type and step-free needs in your browser only.
- Places are ranked on the server from real OSM tags (diet tags, cuisine, wheelchair, fee, brand/Wikidata, opening hours) and each card says why it fits and what is not mapped. No data means no reason; nothing is invented.
- Local Friend receives your preferences plus real nearby places (fetched only when the question needs them) and must label anything else as an AI suggestion. Itineraries are built from real places by reference; coordinates always come from OSM, never from the model.
- Labels: **Source data** (OpenStreetMap), **Reddit**, **Wikivoyage**, **Estimate**, **AI suggestion**, **Your preferences**.

## Running the checks

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest -q tests
cd frontend && npm test && npm run build
```

## Notes on honesty

- Ratings and reviews are never shown or invented. OpenStreetMap has none.
- "Hidden gems" is a heuristic (mapped places without chain/Wikipedia tags), labelled as such.
- AI output (chat, itineraries, typical hours, tips) is labelled as estimates.
- Opening hours are shown exactly as mapped; "open now" is never claimed.
- Distances on cards are straight-line. Route distances come from the routing service.
- Emergency numbers come from a small static list in `backend/app/services/emergency.py`; verify them.
- Public OSM services have usage limits. Set `CONTACT_EMAIL` in `.env` and avoid heavy automated use.

## How answers are sourced

- **Local Friend** receives real OpenStreetMap places and real Reddit/Wikivoyage excerpts as numbered sources. It must tag each factual sentence with `[S#]` (that exact source) or `[AI]` (its own knowledge). The server replaces any tag that does not match a real source with `[AI]`, and the UI renders tags as numbered chips that link to the original.
- **Community** is a page of links. It lists real Reddit threads (found through the free [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) archive, since Reddit closed anonymous access in May 2026) and the Wikivoyage guide, plus search links for Reddit, Google and Tripadvisor. Nothing is summarised. Local Friend can still cite these threads.
- Places come from OpenStreetMap first. If Overpass fails, Geoapify then OpenTripMap are used (if keys are set) and the UI labels those places with their real source. OpenTripMap is never used for Local Help (hospitals, pharmacies, police). There is no built-in or invented place data; if every source fails the app shows an error, or older cached results marked stale.

## Troubleshooting

**Images show a coloured placeholder**
- TravelBuddy shows no photographs. Map tiles (OpenStreetMap) are the only imagery.
- Set `CONTACT_EMAIL` in `.env`: Wikimedia throttles anonymous clients that do not identify themselves.

**Places are slow the first time**
- The first request for a city/category queries Overpass (a few seconds); results are then cached for 6 hours.

**AI features say "not configured"**
- Add `OPENROUTER_API_KEY` to the project-root `.env` and restart the backend.

**Community has no Reddit posts**
- The Arctic Shift archive is a free community service and can be slow or briefly down. The search links on the page always work.
