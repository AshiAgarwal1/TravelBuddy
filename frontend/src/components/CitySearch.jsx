import { useState, useEffect, useRef } from 'react'
import { Search, MapPin, Loader2 } from 'lucide-react'
import { api, isAbort } from '../services/api.js'
import { useCity } from '../context/CityContext.jsx'

export default function CitySearch({ onSelect, large = false, placeholder = 'Search any city, e.g. Oaxaca, Hanoi, Porto' }) {
  const { setCity } = useCity()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  // Debounced, and every superseded request is cancelled so only the latest query reaches the geocoder.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) { setResults(null); setError(null); setLoading(false); return undefined }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      api.geocode(term, ctrl.signal)
        .then((r) => { setResults(r); setError(null); setLoading(false) })
        .catch((e) => { if (!isAbort(e)) { setError(e); setResults(null); setLoading(false) } })
    }, 500)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (c) => { setCity(c); setQ(''); setResults(null); setOpen(false); onSelect?.(c) }

  return (
    <div className={`citysearch ${large ? 'large' : ''}`} ref={box}>
      <div className="field">
        <Search size={18} />
        <input
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && results?.[0] && pick(results[0])}
          placeholder={placeholder} aria-label="Search for a city"
        />
        {loading && <Loader2 className="spin" size={16} />}
      </div>
      {open && q.trim().length >= 3 && !loading && (
        <ul className="dropdown">
          {error && <li className="note">{error.message}</li>}
          {results?.length === 0 && <li className="note">No places found for “{q}”. Check the spelling or try a larger nearby city.</li>}
          {results?.map((c, i) => (
            <li key={i}><button onClick={() => pick(c)}><MapPin size={16} /><span>{c.display_name}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
