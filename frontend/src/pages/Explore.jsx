import { useState, useEffect, useMemo } from 'react'
import { Utensils, Coffee, Gem, Landmark, ShoppingBag, Wrench, Search, Moon, Trees, SlidersHorizontal, Crosshair } from 'lucide-react'
import { useCity } from '../context/CityContext.jsx'
import { usePrefs } from '../context/PrefsContext.jsx'
import { useFetch } from '../hooks/useFetch.js'
import { useGeolocation } from '../hooks/useGeolocation.js'
import { api } from '../services/api.js'
import { haversineKm, NEAR_CITY_KM } from '../lib/geo.js'
import { summarize } from '../lib/prefs.js'
import PlaceBrowser from '../components/PlaceBrowser.jsx'
import { Empty, NeedCity } from '../components/State.jsx'

const CATS = [
  { id: 'restaurants', label: 'Restaurants', icon: Utensils },
  { id: 'cafes', label: 'Cafes', icon: Coffee },
  { id: 'hidden', label: 'Hidden gems', icon: Gem },
  { id: 'attractions', label: 'Attractions', icon: Landmark },
  { id: 'nature', label: 'Parks and nature', icon: Trees },
  { id: 'nightlife', label: 'Nightlife', icon: Moon },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { id: 'useful', label: 'Useful places', icon: Wrench },
]

export default function Explore() {
  const { city } = useCity()
  const { prefs, active: hasPrefs, openPanel } = usePrefs()
  const geo = useGeolocation()
  const [cat, setCat] = useState('restaurants')
  const [radius, setRadius] = useState(4000)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('match')

  // The user's real position is only used when they are actually in/near the chosen city.
  const nearCity = !!(geo.pos && city && haversineKm(geo.pos, city) <= NEAR_CITY_KM)
  const farAway = !!(geo.pos && city && !nearCity)
  const origin = nearCity ? geo.pos : city && { lat: city.lat, lon: city.lon, isUser: false }
  useEffect(() => { geo.clear() }, [city?.lat, city?.lon]) // eslint-disable-line

  const { data, loading, error, reload } = useFetch(
    (signal) => api.places({ lat: city.lat, lon: city.lon, category: cat, radius, origin, sort, prefs }, signal),
    [city?.lat, city?.lon, cat, radius, sort, prefs, origin?.lat, origin?.lon],
    { enabled: !!city },
  )
  const places = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (data?.places || []).filter((p) => !f || p.name.toLowerCase().includes(f) || p.kind.toLowerCase().includes(f))
  }, [data, filter])

  if (!city) return <div className="wrap section"><NeedCity feature="Explore" /></div>
  const chips = summarize(prefs)
  const label = CATS.find((c) => c.id === cat).label

  return (
    <div className="wrap section">
      <h1 className="page-title">Explore {city.name}</h1>
      <div className="prefstrip">
        {hasPrefs ? <span>Personalised for: {chips.map((c) => <span className="chip-static" key={c}>{c}</span>)}</span> : <span>Tell TravelBuddy how you travel to get places ranked for you.</span>}
        <button className="btn ghost small" onClick={openPanel}><SlidersHorizontal size={14} />{hasPrefs ? 'Edit' : 'Set preferences'}</button>
      </div>
      <div className="tabs" role="tablist">
        {CATS.map(({ id, label: l, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={cat === id} className={cat === id ? 'active' : ''} onClick={() => setCat(id)}><Icon size={16} />{l}</button>
        ))}
      </div>
      <div className="toolbar">
        <label className="inline-field"><Search size={16} />
          <input placeholder="Filter results" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <div className="toolbar-right">
          <label className="inline-select">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="match">{hasPrefs ? 'Best match for me' : 'Most complete info'}</option><option value="distance">Nearest</option>
            </select>
          </label>
          <label className="inline-select">Radius
            <select value={radius} onChange={(e) => setRadius(+e.target.value)}>
              <option value={2000}>2 km</option><option value={4000}>4 km</option><option value={8000}>8 km</option><option value={15000}>15 km</option>
            </select>
          </label>
          <button className="btn ghost small" onClick={geo.locate} disabled={geo.status === 'locating'}><Crosshair size={15} />{nearCity ? 'Update my location' : 'Use my location'}</button>
        </div>
      </div>
      {cat === 'hidden' && <p className="notice">Hidden gems are places mapped in OpenStreetMap without chain branding or a Wikipedia entry, with extra details filled in. That suggests local favourites but is not a guarantee. Ask the Local Friend to check one.</p>}

      <PlaceBrowser
        places={places} loading={loading} error={error} onRetry={reload} resetKey={`${cat}|${city.lat}|${city.lon}`}
        loadingLabel={`Finding ${label.toLowerCase()} in ${city.name}`}
        center={[city.lat, city.lon]} origin={origin} onLocate={geo.locate} locating={geo.status === 'locating'}
        notice={<>
          {geo.error && <p className="notice">{geo.error}</p>}
          {farAway && <p className="notice">You appear to be far from {city.name}, so distances are measured from the city centre. Routes need a location inside the city.</p>}
          {nearCity && <p className="notice ok">Using your location for distances and routes.</p>}
          {data?.stale && <p className="notice">The places service is not responding, so you are seeing a saved list from earlier ({Math.round(data.age_s / 3600)} h old).</p>}
        </>}
        empty={<Empty title="Nothing found here">{filter ? 'No results match your filter.' : 'OpenStreetMap has no matching places in this radius. Try a wider radius or another category.'}</Empty>}
      />
    </div>
  )
}
