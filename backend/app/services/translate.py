"""Translation via MyMemory (free, no key). One provider, so the UI label is always accurate."""
import httpx
from fastapi import HTTPException
from .http import get_json


async def translate(text, source, target):
    text = (text or "").strip()
    if not text:
        return ""
    if source == target:
        return text
    text = text[:500]  # MyMemory's per-request limit
    d = await get_json(
        "https://api.mymemory.translated.net/get",
        {"q": text, "langpair": f"{source}|{target}"},
        service="MyMemory", timeout=httpx.Timeout(8.0, connect=3.0),
    )
    out = (d.get("responseData") or {}).get("translatedText") or ""
    if str(d.get("responseStatus")) != "200" or not out:
        raise HTTPException(502, "The translation service could not translate this right now. Try a shorter phrase or try again.")
    return out
