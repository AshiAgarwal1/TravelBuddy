import { useState, useEffect, useRef } from 'react'
import { Loader2, Sparkles, Save, Trash2, Plus, ArrowUp, ArrowDown, Printer, FolderOpen } from 'lucide-react'
import { Map as MapIcon, Clock } from 'lucide-react'
import { useCity } from '../context/CityContext.jsx'
import { usePrefs } from '../context/PrefsContext.jsx'
import { api, isAbort } from '../services/api.js'
import { INTERESTS, COMPANIONS, BUDGETS } from '../lib/prefs.js'
import { fmtKm } from '../lib/geo.js'
import { NeedCity, ErrorBox, Loading } from '../components/State.jsx'
import { SourceTag } from '../components/Source.jsx'
import MapView from '../components/MapView.jsx'

function DayMap({ items, city }) {
  const [sel, setSel] = useState(null)
  const pts = items.filter((i) => i.source === 'osm' && i.place?.lat != null).map((i) => ({ ...i.place, id: i.place.id }))
  if (!pts.length) return <p className="fineprint">None of this day's stops come from mapped places, so there is nothing reliable to pin. We never guess locations.</p>
  return <div className="daymap"><MapView center={[pts[0].lat, pts[0].lon]} places={pts} selectedId={sel} onSelect={setSel} origin={{ lat: city.lat, lon: city.lon, isUser: false }} /></div>
}

export default function Planner() {
  const { city } = useCity()
  const { prefs, setPrefs, openPanel } = usePrefs()
  const [form, setForm] = useState({ days: 3, notes: '' })
  const [mapDay, setMapDay] = useState(null)
  const genCtrl = useRef(null)
  const [trip, setTrip] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [trips, setTrips] = useState({ loading: true, items: [], error: null })

  const loadTrips = () => api.listTrips().then((items) => setTrips({ loading: false, items, error: null })).catch((error) => setTrips({ loading: false, items: [], error }))
  useEffect(() => { const c = new AbortController(); api.listTrips(c.signal).then((items) => setTrips({ loading: false, items, error: null })).catch((error) => { if (!isAbort(error)) setTrips({ loading: false, items: [], error }) }); return () => c.abort() }, [])
  useEffect(() => () => genCtrl.current?.abort(), [])

  if (!city) return <div className="wrap section"><NeedCity feature="The Trip Planner" /></div>

  const toggle = (i) => setPrefs({ ...prefs, interests: prefs.interests.includes(i) ? prefs.interests.filter((x) => x !== i) : [...prefs.interests, i] })
  const budget = prefs.budget || 'mid-range'
  const group = prefs.companions || 'couple'

  const generate = async (e) => {
    e.preventDefault(); setBusy(true); setError(null); setStatus(''); setMapDay(null)
    genCtrl.current?.abort()
    const c = (genCtrl.current = new AbortController())
    try {
      const label = COMPANIONS.find(([id]) => id === group)?.[1] || group
      const t = await api.generateTrip({
        city: city.name, country: city.country, lat: city.lat, lon: city.lon, days: form.days, notes: form.notes,
        budget, group: label.toLowerCase(), interests: prefs.interests, prefs,
      }, c.signal)
      setTrip(t); setDirty(false); loadTrips()
    } catch (err) { if (!isAbort(err)) setError(err) } finally { if (genCtrl.current === c) setBusy(false) }
  }

  const edit = (fn) => { setTrip((t) => { const c = structuredClone(t); fn(c.plan); return c }); setDirty(true); setStatus('') }
  const setItem = (d, i, k, v) => edit((p) => { p.days[d].items[i][k] = v })
  const move = (d, i, dir) => edit((p) => { const a = p.days[d].items; const j = i + dir; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]] })
  const remove = (d, i) => edit((p) => { p.days[d].items.splice(i, 1) })
  const add = (d) => edit((p) => { p.days[d].items.push({ time: '', title: 'New activity', description: '', area: '', est_cost: '', source: 'user' }) })
  const removeDay = (d) => edit((p) => { p.days.splice(d, 1); p.days.forEach((x, n) => { x.day = n + 1 }) })

  const save = async () => {
    setStatus('Saving…')
    try {
      const t = await api.saveTrip(trip.id, { title: trip.title, plan: trip.plan })
      setTrip(t); setDirty(false); setStatus('Saved'); loadTrips()
    } catch (err) { setStatus(''); setError(err) }
  }
  const del = async (id) => {
    try { await api.deleteTrip(id); if (trip?.id === id) setTrip(null); loadTrips() } catch (err) { setError(err) }
  }

  return (
    <div className="wrap section">
      <h1 className="page-title">Plan your trip to {city.name}</h1>
      <div className="planner">
        <form className="panel" onSubmit={generate}>
          <label>Number of days
            <input type="number" min={1} max={10} value={form.days} onChange={(e) => setForm({ ...form, days: Math.min(10, Math.max(1, +e.target.value || 1)) })} />
          </label>
          <fieldset><legend>Budget</legend>
            <div className="seg">{BUDGETS.map(([v, l]) => <button type="button" key={v} className={budget === v ? 'active' : ''} onClick={() => setPrefs({ ...prefs, budget: v })}>{l}</button>)}</div>
          </fieldset>
          <label>Travelling as
            <select value={group} onChange={(e) => setPrefs({ ...prefs, companions: e.target.value })}>{COMPANIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <fieldset><legend>Interests</legend>
            <div className="chips">{INTERESTS.map((i) => <button type="button" key={i} className={`chip ${prefs.interests.includes(i) ? 'on' : ''}`} onClick={() => toggle(i)} aria-pressed={prefs.interests.includes(i)}>{i}</button>)}</div>
          </fieldset>
          <p className="fineprint">Budget, group and interests are saved as your travel style. Diet, pace and accessibility from <button type="button" className="linklike" onClick={openPanel}>your preferences</button> are used too.</p>
          <label>Anything else? (optional)
            <textarea rows={2} maxLength={600} value={form.notes} placeholder="Vegetarian, slow mornings, travelling with a pram…" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button className="btn" disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}{busy ? 'Building your itinerary' : 'Generate itinerary'}</button>
          {error && <ErrorBox error={error} />}

          <div className="saved">
            <h3>Saved trips</h3>
            {trips.loading && <Loading />}
            {trips.error && <ErrorBox error={trips.error} onRetry={loadTrips} />}
            {!trips.loading && !trips.error && trips.items.length === 0 && <p className="fineprint">Generated itineraries are saved here automatically.</p>}
            <ul>
              {trips.items.map((t) => (
                <li key={t.id}>
                  <button onClick={() => { setTrip(t); setDirty(false); setStatus('') }}><FolderOpen size={15} /><span>{t.title}<small>{t.city}, {t.days} days</small></span></button>
                  <button className="icon" aria-label={`Delete ${t.title}`} onClick={() => del(t.id)}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          </div>
        </form>

        <div className="plan">
          {!trip && !busy && <div className="state empty"><div><strong>Your itinerary will appear here</strong><p>Choose your preferences and generate a plan. Every item is editable.</p></div></div>}
          {busy && <Loading label="Building your itinerary. This can take up to a minute." />}
          {trip && !busy && (
            <>
              <div className="plan-head">
                <input className="title-input" value={trip.title} onChange={(e) => { setTrip({ ...trip, title: e.target.value }); setDirty(true); setStatus('') }} aria-label="Trip title" />
                <div className="plan-actions">
                  <button className="btn small" onClick={save} disabled={!dirty}><Save size={15} />Save changes</button>
                  <button className="btn ghost small" onClick={() => window.print()}><Printer size={15} />Print</button>
                </div>
              </div>
              {status && <p className="fineprint">{status}</p>}
              {trip.plan.summary && <p className="lede">{trip.plan.summary}</p>}
              <p className="notice">Times and costs are AI estimates. {trip.plan.meta?.grounded_places ? `Stops labelled “Source data” were matched to real OpenStreetMap places (${trip.plan.meta.grounded_places} were considered).` : 'No mapped places could be retrieved for this plan, so every stop is an AI suggestion to verify.'} Hours are as mapped, never confirmed.</p>
              {trip.plan.days.map((day, d) => (
                <section key={d} className="day">
                  <div className="day-head">
                    <h2>Day {day.day}{day.theme ? `: ${day.theme}` : ''}</h2>
                    <button className="btn ghost small" onClick={() => setMapDay(mapDay === d ? null : d)}><MapIcon size={14} />{mapDay === d ? 'Hide map' : 'Map of mapped stops'}</button>
                    {trip.plan.days.length > 1 && <button className="icon" aria-label={`Remove day ${day.day}`} onClick={() => removeDay(d)}><Trash2 size={15} /></button>}
                  </div>
                  {mapDay === d && <DayMap items={day.items} city={city} />}
                  {day.items.map((it, i) => (
                    <div className="item" key={i}>
                      <input className="time" value={it.time || ''} onChange={(e) => setItem(d, i, 'time', e.target.value)} placeholder="Time" aria-label="Time" />
                      <div className="item-body">
                        <input className="item-title" value={it.title || ''} onChange={(e) => setItem(d, i, 'title', e.target.value)} aria-label="Activity" />
                        <textarea rows={2} value={it.description || ''} onChange={(e) => setItem(d, i, 'description', e.target.value)} aria-label="Description" />
                        <div className="item-tags">
                          {it.source === 'osm' && it.title === it.place?.name && <SourceTag kind="osm" />}
                          {it.source === 'osm' && it.title !== it.place?.name && <span className="src">Edited</span>}
                          {it.source === 'ai' && <SourceTag kind="ai" />}
                          {it.source === 'user' && <span className="src">Added by you</span>}
                          {it.est_cost && <SourceTag kind="estimate">Cost estimate</SourceTag>}
                        </div>
                        {it.why && <p className="item-why"><strong>Why:</strong> {it.why}</p>}
                        {it.source === 'osm' && it.reasons?.length > 0 && <ul className="item-reasons">{it.reasons.map((r, k) => <li key={k}>{r.text}</li>)}</ul>}
                        {it.source === 'osm' && it.place && (
                          <p className="item-place"><Clock size={13} />{it.place.opening_hours ? `${it.place.opening_hours} (as mapped)` : 'Opening hours not mapped'}{it.place.address ? ` · ${it.place.address}` : ''}{it.place.distance_km != null ? ` · ${fmtKm(it.place.distance_km)} from centre` : ''} · <a href={it.place.osm_url} target="_blank" rel="noreferrer">OpenStreetMap</a></p>
                        )}
                        <div className="item-meta">
                          <input value={it.area || ''} onChange={(e) => setItem(d, i, 'area', e.target.value)} placeholder="Area" aria-label="Area" />
                          <input value={it.est_cost || ''} onChange={(e) => setItem(d, i, 'est_cost', e.target.value)} placeholder="Estimated cost" aria-label="Estimated cost" />
                        </div>
                      </div>
                      <div className="item-actions">
                        <button className="icon" aria-label="Move up" onClick={() => move(d, i, -1)} disabled={i === 0}><ArrowUp size={15} /></button>
                        <button className="icon" aria-label="Move down" onClick={() => move(d, i, 1)} disabled={i === day.items.length - 1}><ArrowDown size={15} /></button>
                        <button className="icon" aria-label="Delete activity" onClick={() => remove(d, i)}><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                  <button className="btn ghost small" onClick={() => add(d)}><Plus size={15} />Add activity</button>
                </section>
              ))}
              {trip.plan.tips?.length > 0 && (
                <section className="day"><h2>Planning tips</h2><ul className="bullets">{trip.plan.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
