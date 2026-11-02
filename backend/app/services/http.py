import asyncio
import time
import httpx
from ..config import USER_AGENT

_client: httpx.AsyncClient | None = None

# Short connect timeout: fail fast, then fall back, rather than hanging a whole page.
DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=4.0)


class UpstreamError(Exception):
    """A public/third-party service failed. Routes turn this into a 502 with a readable message."""

    def __init__(self, message: str, service: str = "external service"):
        super().__init__(message)
        self.message = message
        self.service = service


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT}, timeout=DEFAULT_TIMEOUT, follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


class Throttle:
    """Serialises calls and enforces a minimum gap (e.g. Nominatim allows at most 1 request/second)."""

    def __init__(self, min_interval: float):
        self.min_interval = min_interval
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self):
        async with self._lock:
            gap = self.min_interval - (time.monotonic() - self._last)
            if gap > 0:
                await asyncio.sleep(gap)
            self._last = time.monotonic()


async def get_json(url, params=None, service="external service", headers=None, timeout=None, retries=1):
    """GET JSON with a bounded retry (network errors/timeouts/5xx/429 only; never on other 4xx)."""
    last = None
    for attempt in range(retries + 1):
        try:
            r = await client().get(url, params=params, headers=headers, timeout=timeout or DEFAULT_TIMEOUT)
            if r.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                last = UpstreamError(f"{service} returned an error ({r.status_code}). Try again shortly.", service)
                await asyncio.sleep(0.6 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise UpstreamError(f"{service} returned an error ({e.response.status_code}). Try again shortly.", service)
        except httpx.TimeoutException:
            last = UpstreamError(f"{service} took too long to respond. Try again shortly.", service)
        except (httpx.HTTPError, ValueError):
            last = UpstreamError(f"Could not reach {service}. Check your internet connection and try again.", service)
        if attempt < retries:
            await asyncio.sleep(0.6 * (attempt + 1))
    raise last
