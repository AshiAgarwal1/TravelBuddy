import asyncio
import json
import logging
import re
import httpx
from fastapi import HTTPException
from .. import config
from .http import client

log = logging.getLogger("travelbuddy.openrouter")


async def complete(messages, max_tokens=1600, temperature=0.7, timeout=75.0):
    if not config.OPENROUTER_API_KEY:
        raise HTTPException(503, "AI is not configured. Add OPENROUTER_API_KEY to your .env file and restart the backend.")
    r = None
    for attempt in range(2):  # one bounded retry for transient failures
        try:
            r = await client().post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {config.OPENROUTER_API_KEY}", "X-Title": "TravelBuddy"},
                json={"model": config.OPENROUTER_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
                timeout=httpx.Timeout(timeout, connect=5.0),
            )
        except httpx.TimeoutException:  # no retry: the user already waited the full timeout
            raise HTTPException(504, "The AI took too long to answer. Please try again.")
        except httpx.HTTPError as e:
            if attempt == 0:
                await asyncio.sleep(0.8)
                continue
            log.warning("Could not reach OpenRouter: %s", e)
            raise HTTPException(502, "Could not reach OpenRouter. Check your internet connection.")
        if r.status_code in (429, 502, 503) and attempt == 0:
            await asyncio.sleep(1.2)
            continue
        break
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message", "")
        except ValueError:
            msg = ""
        log.warning("OpenRouter %s for model %s: %s", r.status_code, config.OPENROUTER_MODEL, msg or r.text[:300])
        raise HTTPException(502, f"OpenRouter error ({r.status_code}): {msg or 'request failed'}")
    try:
        return r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError):
        raise HTTPException(502, "OpenRouter returned an unexpected response.")


def parse_json(text: str):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(502, "The AI response could not be read. Please try again.")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        raise HTTPException(502, "The AI response could not be read. Please try again.")
