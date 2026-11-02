"""Wikipedia text summaries (no images)."""
from urllib.parse import quote
import httpx
from .http import client

TIMEOUT = httpx.Timeout(8.0, connect=3.0)


async def _rest_summary(title: str, site: str):
    url = f"https://{site}/api/rest_v1/page/summary/{quote(title.replace(' ', '_'), safe='')}"
    try:
        r = await client().get(url, timeout=TIMEOUT)
        if r.status_code != 200:
            return None
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    if d.get("type") == "disambiguation":
        return None
    return {"title": d.get("title"), "extract": d.get("extract"),
            "url": d.get("content_urls", {}).get("desktop", {}).get("page"), "source": site}


async def _action_summary(title: str, site: str):
    """Same text from the MediaWiki Action API, used when the REST endpoint fails."""
    try:
        r = await client().get(f"https://{site}/w/api.php", timeout=TIMEOUT, params={
            "action": "query", "format": "json", "formatversion": 2, "redirects": 1, "titles": title,
            "prop": "extracts|info", "exintro": 1, "explaintext": 1, "exsentences": 4, "inprop": "url"})
        page = r.json()["query"]["pages"][0]
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None
    if page.get("missing") or page.get("invalid") or not page.get("extract"):
        return None
    return {"title": page.get("title"), "extract": page.get("extract"), "url": page.get("fullurl"), "source": site}


async def summary(title: str, site: str = "en.wikipedia.org"):
    candidates = [title]
    if "," in title:
        candidates.append(title.split(",")[0].strip())
    if title.lower().startswith("new "):
        candidates.append(title[4:].strip())
    for t in candidates:
        s = await _rest_summary(t, site) or await _action_summary(t, site)
        if s:
            return s
    return None


async def city_summary(name: str, region: str = ""):
    for t in (name, f"{name}, {region}" if region else None):
        if t:
            s = await summary(t)
            if s:
                return s
    return None
