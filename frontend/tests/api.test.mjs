import test from 'node:test'
import assert from 'node:assert/strict'

let calls = 0
let aborted = 0
globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
  calls++
  const t = setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ url }) }), 150)
  signal.addEventListener('abort', () => { aborted++; clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
})
const { api, isAbort } = await import('../src/services/api.js')
const reset = () => { calls = 0; aborted = 0 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('identical in-flight requests share one network call', async () => {
  reset()
  const [a, b] = await Promise.all([api.geocode('paris'), api.geocode('paris')])
  assert.equal(calls, 1)
  assert.deepEqual(a, b)
})

test('responses are cached for repeat visits', async () => {
  reset()
  await api.geocode('paris')
  assert.equal(calls, 0)
})

test('React StrictMode pattern (subscribe, abort, resubscribe) does not duplicate or cancel the request', async () => {
  reset()
  const first = new AbortController()
  const p1 = api.geocode('rome', first.signal).catch((e) => e)
  first.abort()
  const second = new AbortController()
  const p2 = api.geocode('rome', second.signal)
  assert.ok(isAbort(await p1))
  await p2
  assert.equal(calls, 1)
  assert.equal(aborted, 0)
})

test('one caller leaving does not cancel the request for another', async () => {
  reset()
  const a = new AbortController()
  const pa = api.geocode('oslo', a.signal).catch((e) => e)
  const pb = api.geocode('oslo')
  a.abort()
  assert.ok(isAbort(await pa))
  await pb
  assert.equal(aborted, 0)
})

test('the network request is aborted once every caller has gone', async () => {
  reset()
  const a = new AbortController()
  const pa = api.geocode('lima', a.signal).catch((e) => e)
  a.abort()
  await pa
  await sleep(120)
  assert.equal(aborted, 1)
})

test('places requests include prefs but not an empty prefs object', async () => {
  reset()
  const seen = []
  const orig = globalThis.fetch
  globalThis.fetch = (url, o) => { seen.push(url); return orig(url, o) }
  await api.places({ lat: 1, lon: 2, category: 'cafes', radius: 4000, prefs: { diet: [], interests: [], budget: null } })
  await api.places({ lat: 1, lon: 2, category: 'cafes', radius: 4000, sort: 'distance', prefs: { diet: ['vegan'] } })
  globalThis.fetch = orig
  assert.ok(!seen[0].includes('prefs='))
  assert.ok(seen[1].includes('prefs='))
})
