import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Loader2, SlidersHorizontal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useCity } from '../context/CityContext.jsx'
import { usePrefs } from '../context/PrefsContext.jsx'
import { api, isAbort } from '../services/api.js'
import { summarize } from '../lib/prefs.js'
import { fmtKm } from '../lib/geo.js'
import { NeedCity, ErrorBox } from '../components/State.jsx'
import { SourceTag } from '../components/Source.jsx'
import MapView from '../components/MapView.jsx'

const BASE = [
  'Where do locals go for a great meal that tourists miss?',
  'Which tourist traps should I avoid?',
  'How do I get around and what should I pay?',
  'What should I know about etiquette and safety?',
]

function startersFor(prefs, city) {
  const out = []
  if (prefs.diet.length) out.push(`Where can I eat ${prefs.diet.join(' and ')} food near the centre of ${city}?`)
  if (prefs.cuisines.length) out.push(`Where would a local send me for ${prefs.cuisines[0]}?`)
  const i = prefs.interests.map((x) => x.toLowerCase())
  if (i.includes('history')) out.push('Which historic places are worth my time, and which can I skip?')
  if (i.includes('art and museums')) out.push('Which museums or galleries would you pick for me?')
  if (i.includes('nature')) out.push('Where can I get some green space and quiet?')
  if (i.includes('nightlife')) out.push('Where do locals go for a drink in the evening?')
  if (prefs.step_free) out.push('Which sights and neighbourhoods are easiest to get around step-free?')
  if (prefs.budget === 'budget') out.push('How can I do this city well on a tight budget?')
  return [...out, ...BASE].slice(0, 5)
}

// Turn [S3] / [AI] tags in the reply into small chips: numbered links to the real source, or an "AI" marker.
function Answer({ text, sources = [] }) {
  const byId = Object.fromEntries(sources.map((x) => [x.id, x]))
  const md = text.replace(/\[(S\d+|AI)\]/g, (_, id) => `[${id}](#cite-${id})`)
  return (
    <ReactMarkdown components={{
      a: ({ href, children }) => {
        const id = href?.startsWith('#cite-') ? href.slice(6) : null
        if (!id) return <a href={href} target="_blank" rel="noreferrer">{children}</a>
        if (id === 'AI') return <span className="cite cite-ai" title="From the AI's general knowledge, not from a retrieved source. Verify it.">AI</span>
        const s = byId[id]
        return s ? <a className={`cite cite-${s.type}`} href={s.url || undefined} target="_blank" rel="noreferrer" title={`${s.title} (${s.meta})`}>{id.slice(1)}</a> : null
      },
    }}>{md}</ReactMarkdown>
  )
}

function SourceList({ sources = [] }) {
  const cited = sources.filter((s) => s.cited)
  if (!cited.length) return null
  return (
    <details className="grounding" open>
      <summary>Sources cited in this answer ({cited.length})</summary>
      <ul>{cited.map((s) => (
        <li key={s.id}><span className={`cite cite-${s.type}`}>{s.id.slice(1)}</span> <SourceTag kind={s.type} />{' '}
          {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title} <span className="dim">{s.meta}</span></li>
      ))}</ul>
    </details>
  )
}

function Grounding({ g, city, selectedId, onSelect }) {
  if (!g?.places?.length) return null
  const mapPlaces = g.places.filter((p) => p.lat != null && p.lon != null)
  return (
    <div className="grounding-block">
      <details className="grounding" open>
        <summary><SourceTag kind="osm" /> Checked against {g.places.length} real places from OpenStreetMap{g.personalized ? ', ranked for you' : ''}</summary>
        <ul>{g.places.map((p) => (
          <li key={p.id}>
            <button type="button" className="linklike" onClick={() => onSelect?.(p.id)}>{p.name}</button>
            {' '}<span className="dim">{p.kind}{p.distance_km != null ? `, ${fmtKm(p.distance_km)} from the centre` : ''}</span>
          </li>
        ))}</ul>
      </details>
      {mapPlaces.length > 0 && city && (
        <div className="friend-map">
          <MapView
            center={[city.lat, city.lon]}
            places={mapPlaces}
            selectedId={selectedId}
            onSelect={onSelect}
            origin={{ lat: city.lat, lon: city.lon, isUser: false }}
          />
        </div>
      )}
    </div>
  )
}

export default function LocalFriend() {
  const { city } = useCity()
  const { prefs, active, openPanel } = usePrefs()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const end = useRef(null)
  const ctrl = useRef(null)
  const starters = useMemo(() => (city ? startersFor(prefs, city.name) : BASE), [prefs, city?.name]) // eslint-disable-line

  useEffect(() => { ctrl.current?.abort(); setMessages([]); setError(null); setLoading(false); setSelectedId(null) }, [city?.display_name])
  useEffect(() => () => ctrl.current?.abort(), [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  if (!city) return <div className="wrap section"><NeedCity feature="Your Local Friend" /></div>

  const send = async (text, base = messages) => {
    const t = text.trim()
    if (!t || loading) return
    const next = [...base, { role: 'user', content: t }]
    setMessages(next); setInput(''); setError(null); setLoading(true); setSelectedId(null)
    ctrl.current?.abort()
    const c = (ctrl.current = new AbortController())
    try {
      const history = next.map(({ role, content }) => ({ role, content }))
      const r = await api.chat({ city: city.name, country: city.country, lat: city.lat, lon: city.lon, messages: history, prefs }, c.signal)
      setMessages([...next, { role: 'assistant', content: r.reply, grounding: r.grounding, sources: r.sources }])
    } catch (e) { if (!isAbort(e)) setError({ error: e, retry: () => send(t, base) }) } finally { if (ctrl.current === c) setLoading(false) }
  }

  return (
    <div className="wrap section narrow">
      <h1 className="page-title">Your local friend in {city.name}</h1>
      <p className="lede">Ask like you would ask a friend who lives here. Answers are AI-written. Numbered chips link to the Reddit, Wikivoyage or OpenStreetMap source behind a claim; an AI chip means it is the model's own knowledge.</p>
      <div className="prefstrip">
        {active ? <span>Advice tailored to: {summarize(prefs).map((c) => <span className="chip-static" key={c}>{c}</span>)}</span> : <span>Add your travel style and answers will fit you better.</span>}
        <button className="btn ghost small" onClick={openPanel}><SlidersHorizontal size={14} />{active ? 'Edit' : 'Set preferences'}</button>
      </div>
      <div className="chat">
        {messages.length === 0 && (
          <div className="starters">
            {starters.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? (
              <>
                <Answer text={m.content} sources={m.sources} />
                <SourceList sources={m.sources} />
                <Grounding g={m.grounding} city={city} selectedId={selectedId} onSelect={setSelectedId} />
              </>
            ) : <p>{m.content}</p>}
          </div>
        ))}
        {loading && <div className="msg assistant"><Loader2 className="spin" size={16} /> Thinking about {city.name}</div>}
        {error && <ErrorBox error={error.error} onRetry={error.retry} />}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <textarea rows={1} value={input} placeholder={`Ask about ${city.name}`} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }} />
        <button className="btn" disabled={loading || !input.trim()}><Send size={16} />Send</button>
      </form>
    </div>
  )
}
