"""Two-level cache (memory + SQLite) with single-flight and stale-on-error.

* Single-flight: concurrent identical requests share one upstream call.
* Stale-on-error: if a refresh fails and an older value exists inside the stale window,
  the old value is served (flagged) instead of an error.
* Persistence (opt-in per call): survives backend restarts, so public OSM services are not
  re-queried for the same city/category every time the dev server reloads.
"""
import asyncio
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass

log = logging.getLogger("travelbuddy.cache")

MAX_ENTRIES = 3000
_mem: "OrderedDict[str, tuple[float, float, float, object]]" = OrderedDict()  # key -> (stored, expires, stale_until, value)
_inflight: dict[str, asyncio.Task] = {}


@dataclass
class Cached:
    value: object
    stale: bool = False      # served from an expired entry because refreshing failed
    cached: bool = False     # served without calling the factory
    age_s: int = 0


def clear():
    _mem.clear()
    _inflight.clear()


def _mem_put(key, stored, expires, stale_until, value):
    _mem[key] = (stored, expires, stale_until, value)
    _mem.move_to_end(key)
    while len(_mem) > MAX_ENTRIES:
        _mem.popitem(last=False)


def _db_get(key):
    try:
        from .database import SessionLocal
        from .models import CacheEntry
        with SessionLocal() as db:
            row = db.get(CacheEntry, key)
            return (row.stored_at, row.expires_at, row.stale_until, row.value) if row else None
    except Exception as e:  # cache must never break a request
        log.debug("cache db read failed: %s", e)
        return None


def _db_put(key, stored, expires, stale_until, value):
    try:
        from .database import SessionLocal
        from .models import CacheEntry
        with SessionLocal() as db:
            row = db.get(CacheEntry, key)
            if row is None:
                row = CacheEntry(key=key)
                db.add(row)
            row.stored_at, row.expires_at, row.stale_until, row.value = stored, expires, stale_until, value
            db.commit()
    except Exception as e:
        log.debug("cache db write failed: %s", e)


async def fetch_cached(key, ttl, factory, *, stale_ttl=0, persist=False) -> Cached:
    """ttl may be a number or a callable(value) -> seconds (return 0 to skip caching)."""
    now = time.time()
    entry = _mem.get(key)
    if entry is None and persist:
        entry = await asyncio.to_thread(_db_get, key)
        if entry:
            _mem_put(key, *entry)
    if entry and entry[1] > now:
        _mem.move_to_end(key)
        return Cached(entry[3], cached=True, age_s=int(now - entry[0]))

    task = _inflight.get(key)
    if task is None:
        async def run():
            value = await factory()
            seconds = ttl(value) if callable(ttl) else ttl
            if seconds and seconds > 0:
                t = time.time()
                _mem_put(key, t, t + seconds, t + seconds + stale_ttl, value)
                if persist:
                    await asyncio.to_thread(_db_put, key, t, t + seconds, t + seconds + stale_ttl, value)
            return value
        task = asyncio.ensure_future(run())
        _inflight[key] = task
        task.add_done_callback(lambda _t, k=key: _inflight.pop(k, None))
        task.add_done_callback(lambda t: t.cancelled() or t.exception())  # mark retrieved

    try:
        value = await asyncio.shield(task)
        return Cached(value)
    except asyncio.CancelledError:
        raise
    except Exception:
        if entry and entry[2] > time.time():
            log.warning("serving stale cache for %s after upstream failure", key)
            return Cached(entry[3], stale=True, cached=True, age_s=int(time.time() - entry[0]))
        raise


async def get_or_set(key, ttl, factory, **kw):
    return (await fetch_cached(key, ttl, factory, **kw)).value
