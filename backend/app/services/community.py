"""Community knowledge: real text from Reddit and Wikivoyage, numbered so an AI summary can cite it.

Nothing here is generated. `summarize()` only sees the numbered excerpts, must cite them, and every
point is checked server-side: points that cite nothing (or cite a source that does not exist) are dropped.
"""
from __future__ import annotations
import asyncio
import re
import httpx
from . import openrouter
from .http import client

TIMEOUT = httpx.Timeout(8.0, connect=3.0)
ARCHIVE_TIMEOUT = httpx.Timeout(14.0, connect=4.0)
WV_SECTIONS = ["Understand", "Get around", "Eat", "Drink", "Stay safe", "Respect", "Buy", "Cope", "Get in", "See", "Do"]
BOILERPLATE = re.compile(r"\b(automoderator|this is a bot)\b", re.I)
TRAVEL_WORDS = re.compile(r"\b(visit|visiting|trip|travel|tourist|tourists|stay|staying|hotel|hostel|itinerary|recommend|recommendations?|"
                          r"safe|safety|scam|food|eat|restaurant|transport|taxi|metro|bus|train|worth|days?)\b", re.I)

# Reddit. Anonymous reddit.com/*.json has returned 403 since May 2026 and new official API keys are no longer
# issued, so TravelBuddy reads the free Arctic Shift archive of Reddit instead (no key; posts can lag a few days).
ARCTIC = "https://arctic-shift.photon-reddit.com/api"
TRAVEL_SUBS = ["travel", "solotravel"]
COUNTRY_SUBS = {"india": "IndiaTravel", "japan": "JapanTravel", "italy": "ItalyTravel", "thailand": "ThailandTourism"}


def _clip(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + "…"


# ---------- Reddit (Arctic Shift archive) ----------

async def _archive_posts(sub: str, query: str | None):
    params = {"subreddit": sub, "limit": 100, "sort": "desc", "over_18": "false"}
    if query:
        params["query"] = query
    try:
        r = await client().get(f"{ARCTIC}/posts/search", params=params, timeout=ARCHIVE_TIMEOUT)
        if r.status_code != 200:
            return []
        return r.json().get("data") or []
    except (httpx.HTTPError, ValueError):
        return []


def _usable_post(d, city_l, in_city_sub):
    title = (d.get("title") or "")
    body = d.get("selftext") or ""
    if not title or d.get("over_18") or body in ("[removed]", "[deleted]") or d.get("removed_by_category"):
        return False
    hay = f"{title} {body}".lower()
    if in_city_sub:                      # a city's own subreddit: keep posts that look like travel questions
        return bool(TRAVEL_WORDS.search(hay))
    return city_l in hay


async def _reddit_search(city: str, country: str = ""):
    city_l = city.lower()
    subs = list(TRAVEL_SUBS)
    if country.lower() in COUNTRY_SUBS:
        subs.append(COUNTRY_SUBS[country.lower()])
    city_sub = re.sub(r"[^a-z0-9]", "", city_l)
    jobs = [(s, False, _archive_posts(s, city)) for s in subs]
    if len(city_sub) >= 3:
        jobs.append((city_sub, True, _archive_posts(city_sub, None)))
    results = await asyncio.gather(*(j[2] for j in jobs))
    posts, seen = [], set()
    for (sub, in_city_sub, _), items in zip(jobs, results):
        for d in items:
            if d.get("id") in seen or not _usable_post(d, city_l, in_city_sub):
                continue
            seen.add(d["id"])
            posts.append(d)
    posts.sort(key=lambda d: (d.get("num_comments", 0) >= 5, d.get("score", 0), d.get("num_comments", 0)), reverse=True)
    return posts[:5]


async def _top_comments(post_id: str, n=3):
    try:
        r = await client().get(f"{ARCTIC}/comments/search", timeout=ARCHIVE_TIMEOUT, params={"link_id": post_id, "limit": 100})
        if r.status_code != 200:
            return []
        items = r.json().get("data") or []
    except (httpx.HTTPError, ValueError):
        return []
    good = []
    for d in items:
        body = d.get("body") or ""
        if (d.get("stickied") or body in ("[removed]", "[deleted]") or BOILERPLATE.search((d.get("author") or "") + body[:80])
                or (d.get("score") or 0) < 3 or len(body) < 40):
            continue
        good.append(d)
    good.sort(key=lambda d: d.get("score", 0), reverse=True)
    return [_clip(d["body"], 450) for d in good[:n]]


async def _reddit_sources(city: str, country: str = ""):
    posts = await _reddit_search(city, country)
    comments = await asyncio.gather(*(_top_comments(p["id"]) for p in posts[:3])) if posts else []
    out = []
    for i, p in enumerate(posts):
        body = _clip(p.get("selftext") or "", 500)
        top = comments[i] if i < len(comments) else []
        text = " ".join(x for x in (body, *[f"Top comment: {c}" for c in top]) if x)
        link = p.get("permalink") or f"/comments/{p['id']}"
        out.append({"type": "reddit", "title": p["title"], "url": "https://www.reddit.com" + link,
                    "text": text or "(title only, no text available)",
                    "meta": f"r/{p.get('subreddit', '')}, {p.get('score', 0)} points, {p.get('num_comments', 0)} comments"})
    return out


# ---------- Wikivoyage ----------

async def _wikivoyage(city: str):
    """Plain text of the useful Wikivoyage sections (Stay safe, Get around, ...), via the Action API only."""
    page = None
    for attempt in (city, None):
        try:
            if attempt is None:                      # name did not match a page: take the best search hit
                r = await client().get("https://en.wikivoyage.org/w/api.php", timeout=TIMEOUT, params={
                    "action": "query", "list": "search", "srsearch": city, "srlimit": 1, "format": "json", "formatversion": 2})
                hits = r.json()["query"]["search"]
                if not hits:
                    break
                attempt = hits[0]["title"]
            r = await client().get("https://en.wikivoyage.org/w/api.php", timeout=TIMEOUT, params={
                "action": "query", "prop": "extracts|info", "explaintext": 1, "exsectionformat": "wiki", "inprop": "url",
                "redirects": 1, "titles": attempt, "format": "json", "formatversion": 2})
            p = r.json()["query"]["pages"][0]
        except (httpx.HTTPError, ValueError, KeyError, IndexError):
            continue
        if not p.get("missing") and p.get("extract"):
            page = p
            break
    if not page:
        return []
    text = page["extract"]
    intro = re.split(r"^==[^=]", text, maxsplit=1, flags=re.M)[0]
    parts = [("Overview", intro)]
    for name in WV_SECTIONS:
        m = re.search(rf"^==\s*{name}\s*==\s*\n(.*?)(?=^==[^=]|\Z)", text, re.S | re.M)
        if m and len(m.group(1).strip()) > 80:
            parts.append((name, re.sub(r"^=+.*?=+\s*$", "", m.group(1), flags=re.M)))
    title, url = page.get("title") or city, page.get("fullurl")
    return [{"type": "wikivoyage", "title": f"Wikivoyage: {title}, {n}", "url": url, "text": _clip(t, 700),
             "meta": "Community-written travel guide (CC BY-SA)"} for n, t in parts if t.strip()][:5]


# ---------- Gather ----------

async def _safe(coro, seconds):
    try:
        return await asyncio.wait_for(coro, seconds)
    except Exception:
        return []


def _interleave(groups, caps):
    """Round-robin so any prefix of the list (the chat only reads the first few) mixes all sources."""
    lists = [g[:c] for g, c in zip(groups, caps)]
    out = []
    for i in range(max((len(x) for x in lists), default=0)):
        out += [x[i] for x in lists if i < len(x)]
    return out


async def gather(city: str, country: str = ""):
    """Returns (sources, note). Each source: id, type, title, url, text, meta."""
    wv, rd = await asyncio.gather(_safe(_wikivoyage(city), 10), _safe(_reddit_sources(city, country), 16))
    sources = _interleave([wv, rd], [4, 5])
    for n, s in enumerate(sources, 1):
        s["id"] = f"S{n}"
    missing = [label for label, got in (("Reddit", rd), ("Wikivoyage", wv)) if not got]
    note = f"No results from {', '.join(missing)} right now." if missing and sources else None
    return sources, note


def excerpt_block(sources, limit=6, chars=420) -> str:
    if not sources:
        return ""
    lines = ["COMMUNITY_SOURCES (real excerpts from Reddit/Wikivoyage; opinions of individuals, not verified facts):"]
    for s in sources[:limit]:
        lines.append(f"[{s['id']}] ({s['type']}) {s['title']}: {_clip(s['text'], chars)}")
    return "\n".join(lines)


SUMMARY_PROMPT = """You summarise community travel knowledge about {place}. Use ONLY the numbered SOURCES below.
Rules:
- Every point must be supported by at least one source and list its ids in "sources". Never add facts from your own knowledge.
- Say who said it: reflect when something is one person's opinion versus several sources agreeing. If sources disagree, say so.
- Do not invent quotes, prices, names or numbers that are not in the sources.
- 4 to 8 points, each one or two plain sentences. Skip anything vague.
- "topic" is one of: Getting around, Food, Safety, Money, Etiquette, Sights, Other.
Reply with JSON only: {{"points":[{{"topic":"...","text":"...","sources":["S1"]}}],"caveat":"one sentence on how thin or one-sided the sources are"}}

SOURCES:
{sources}"""


async def summarize(city: str, sources):
    if not sources:
        return None
    block = "\n\n".join(f"[{s['id']}] ({s['type']}) {s['title']}\n{s['text']}" for s in sources)
    raw = await openrouter.complete([{"role": "user", "content": SUMMARY_PROMPT.format(place=city, sources=block)}],
                                    max_tokens=1100, temperature=0.2, timeout=40)
    data = openrouter.parse_json(raw)
    valid = {s["id"] for s in sources}
    points = []
    for p in data.get("points") or []:
        ids = [i for i in (p.get("sources") or []) if i in valid]
        if p.get("text") and ids:           # uncited claims are dropped, not shown
            points.append({"topic": p.get("topic") or "Other", "text": p["text"].strip(), "sources": ids})
    return {"points": points[:8], "caveat": data.get("caveat") or "", "label": "AI summary of the sources below. Check the originals."}


TAG = re.compile(r"\[(S\d+|AI)\]")


def validate_tags(reply: str, valid_ids: set[str]) -> str:
    """Any [S#] tag that does not match a real source becomes [AI] (honest default)."""
    return TAG.sub(lambda m: m.group(0) if m.group(1) == "AI" or m.group(1) in valid_ids else "[AI]", reply)
