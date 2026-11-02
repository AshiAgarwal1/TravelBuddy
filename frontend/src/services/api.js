/**
 * API client with request de-duplication, short-lived response caching and cancellation.
 *
 * - Identical GETs that are in flight are shared (React StrictMode, two components asking for the same thing).
 * - Each caller can cancel with an AbortSignal. The network request itself is only aborted when *every*
 *   caller has gone away, so one component unmounting never breaks another.
 * - Successful GETs are cached in memory for `ttl`, so flipping tabs/cities back and forth costs nothing.
 */
const inflight = new Map()
const cache = new Map()
const MAX_CACHE = 200

const abortError = () => new DOMException('Aborted', 'AbortError')
export const isAbort = (e) => e?.name === 'AbortError'

async function rawRequest(path, { signal, timeout = 45000, ...options } = {}) {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeout)
  const onAbort = () => ctrl.abort()
  if (signal) signal.aborted ? ctrl.abort() : signal.addEventListener('abort', onAbort, { once: true })
  let res
  try {
    res = await fetch(path, { ...options, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  } catch (e) {
    if (timedOut) throw new Error('This is taking too long. The service may be busy, so please try again.')
    if (isAbort(e)) throw e
    throw new Error('Cannot reach the TravelBuddy backend. Make sure it is running on port 8000.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (res.status === 204) return null
  let body = null
  try { body = await res.json() } catch { /* not JSON */ }
  if (!res.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
  }
  return body
}

function subscribe(entry, key, signal) {
  entry.subs++
  return new Promise((resolve, reject) => {
    let done = false
    const leave = () => {
      if (done) return
      done = true
      entry.subs--
      // Wait a beat: StrictMode (and fast re-renders) unsubscribe and immediately resubscribe.
      if (entry.subs === 0) setTimeout(() => { if (entry.subs === 0) { entry.ctrl.abort(); if (inflight.get(key) === entry) inflight.delete(key) } }, 60)
    }
    const onAbort = () => { leave(); reject(abortError()) }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    entry.promise.then(
      (v) => { if (!done) { done = true; entry.subs--; signal?.removeEventListener('abort', onAbort); resolve(v) } },
      (e) => { if (!done) { done = true; entry.subs--; signal?.removeEventListener('abort', onAbort); reject(e) } },
    )
  })
}

function get(path, { ttl = 0, signal, timeout } = {}) {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return signal?.aborted ? Promise.reject(abortError()) : Promise.resolve(hit.value)
  let entry = inflight.get(path)
  if (!entry) {
    const ctrl = new AbortController()
    const promise = rawRequest(path, { signal: ctrl.signal, timeout }).then((value) => {
      if (ttl) {
        cache.set(path, { value, expires: Date.now() + ttl })
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value)
      }
      return value
    }).finally(() => { if (inflight.get(path) === entry) inflight.delete(path) })
    entry = { promise, ctrl, subs: 0 }
    inflight.set(path, entry)
  }
  return subscribe(entry, path, signal)
}

const qs = (o) => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))).toString()
const send = (method, path, data, opts = {}) => rawRequest(path, { method, body: data === undefined ? undefined : JSON.stringify(data), ...opts })

const MIN = 60 * 1000
// Preferences are sent to the server only to rank cached results; they never change what is fetched upstream.
const prefsParam = (p) => (p && Object.values(p).some((v) => (Array.isArray(v) ? v.length : v)) ? JSON.stringify(p) : undefined)
const round = (n, d = 4) => (n == null ? n : +n.toFixed(d))

export const api = {
  health: (signal) => get('/api/health', { ttl: MIN, signal }),
  geocode: (q, signal) => get(`/api/geocode?${qs({ q })}`, { ttl: 10 * MIN, signal }),
  reverse: (lat, lon, signal) => get(`/api/reverse?${qs({ lat: round(lat, 2), lon: round(lon, 2) })}`, { ttl: 60 * MIN, signal }),
  city: (name, region, signal) => get(`/api/city?${qs({ name, region })}`, { ttl: 60 * MIN, signal }),
  places: ({ lat, lon, category, radius, origin, sort, prefs }, signal) =>
    get(`/api/places?${qs({ lat: round(lat), lon: round(lon), category, radius, origin_lat: round(origin?.lat), origin_lon: round(origin?.lon), sort, prefs: prefsParam(prefs) })}`, { ttl: 5 * MIN, signal, timeout: 14000 }),
  weather: (lat, lon, signal) => get(`/api/weather?${qs({ lat, lon })}`, { ttl: 5 * MIN, signal, timeout: 8000 }),
  helpNumbers: (country_code, signal) => get(`/api/help/numbers?${qs({ country_code })}`, { ttl: 60 * MIN, signal, timeout: 5000 }),
  helpPlaces: ({ lat, lon, category, radius, origin }, signal) =>
    get(`/api/help/places?${qs({ lat: round(lat), lon: round(lon), category, radius, origin_lat: round(origin?.lat), origin_lon: round(origin?.lon) })}`, { ttl: 5 * MIN, signal, timeout: 14000 }),
  route: ({ from, to, mode }, signal) =>
    get(`/api/route?${qs({ from_lat: round(from.lat, 5), from_lon: round(from.lon, 5), to_lat: round(to.lat, 5), to_lon: round(to.lon, 5), mode })}`, { ttl: 30 * MIN, signal }),
  community: (city, country, signal) => get(`/api/community?${qs({ city, country })}`, { ttl: 10 * MIN, signal }),
  insights: (city, country, signal) => get(`/api/insights?${qs({ city, country })}`, { ttl: 60 * MIN, signal, timeout: 90000 }),
  chat: (data, signal) => send('POST', '/api/chat', data, { signal, timeout: 90000 }),
  translate: (data) => send('POST', '/api/translate', data),
  generateTrip: (data, signal) => send('POST', '/api/trips/generate', data, { signal, timeout: 130000 }),
  listTrips: (signal) => rawRequest('/api/trips', { signal }),
  saveTrip: (id, data) => send('PUT', `/api/trips/${id}`, data),
  deleteTrip: (id) => send('DELETE', `/api/trips/${id}`),
}
