import { useState } from 'react'
import { Compass, MessageCircle, CalendarDays, CloudSun, LifeBuoy, Languages, Users, SlidersHorizontal, Map as MapIcon, List, MapPin, ArrowRight } from 'lucide-react'
import CitySearch from '../components/CitySearch.jsx'
import AtlasMap from '../components/AtlasMap.jsx'
import { Loading, ErrorBox } from '../components/State.jsx'
import { SourceTag } from '../components/Source.jsx'
import { useFetch } from '../hooks/useFetch.js'
import { useCity } from '../context/CityContext.jsx'
import { usePrefs } from '../context/PrefsContext.jsx'
import { summarize } from '../lib/prefs.js'
import { ATLAS_CITIES } from '../lib/cities.js'
import { api } from '../services/api.js'

const FEATURES = [
  { id: 'explore', icon: Compass, title: 'Explore', text: 'Restaurants, cafes, hidden gems and sights on a live map.' },
  { id: 'friend', icon: MessageCircle, title: 'Local Friend', text: 'Ask anything about the city and get honest local advice.' },
  { id: 'planner', icon: CalendarDays, title: 'Trip Planner', text: 'An editable day-by-day itinerary built around you.' },
  { id: 'insights', icon: CloudSun, title: 'Insights', text: 'Forecast, typical opening hours and etiquette.' },
  { id: 'help', icon: LifeBuoy, title: 'Local Help', text: 'Nearby hospitals, pharmacies and emergency numbers.' },
  { id: 'translator', icon: Languages, title: 'Translator', text: 'Translate text and use your voice.' },
  { id: 'community', icon: Users, title: 'Community', text: 'Links to what travellers say on Reddit and Wikivoyage.' },
]
const REGIONS = ['Europe', 'Africa', 'Asia', 'Oceania', 'Americas']

export default function Home({ go }) {
  const { city, setCity } = useCity()
  const { prefs, active, openPanel } = usePrefs()
  const [view, setView] = useState('map')
  const [selected, setSelected] = useState(null)
  const [pickError, setPickError] = useState(null)
  const [picking, setPicking] = useState(false)

  const preview = useFetch((s) => api.places({ lat: selected.lat, lon: selected.lon, category: 'attractions', radius: 4000 }, s),
    [selected?.lat, selected?.lon], { enabled: !!selected })
  const places = (preview.data?.places || []).slice(0, 8)

  const choose = (c) => { setPickError(null); setCity(c); setSelected(c); setView('map') }

  // Click anywhere on the atlas: resolve the real place under the pointer, never invent one.
  const pickPoint = async (lat, lon) => {
    setPicking(true); setPickError(null)
    try {
      const r = await api.reverse(lat, lon)
      if (!r?.name) throw new Error('No city or town found there. Try clicking closer to a settlement, or search by name.')
      choose({ name: r.name, region: '', country: r.country, country_code: r.country_code, lat, lon, display_name: [r.name, r.country].filter(Boolean).join(', ') })
    } catch (e) { setPickError(e) } finally { setPicking(false) }
  }

  return (
    <>
      <section className="atlas">
        <div className="atlas-head wrap">
          <h1>Your local friend, anywhere you go.</h1>
          <p>Choose a place on the atlas, or search for any city. TravelBuddy shows the places locals actually go.</p>
        </div>
        <div className="atlas-bar wrap">
          <div className="atlas-tabs" role="tablist" aria-label="Atlas view">
            <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><MapIcon size={15} />Map</button>
            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} />List</button>
          </div>
          <CitySearch large onSelect={choose} />
        </div>
        <div className="atlas-body wrap">
          <div className="atlas-stage">
            {view === 'map' ? (
              <AtlasMap cities={ATLAS_CITIES} selected={selected} places={places} onSelectCity={choose} onPickPoint={pickPoint} />
            ) : (
              <div className="atlas-list">
                {REGIONS.map((r) => (
                  <div key={r}>
                    <h3>{r}</h3>
                    <ul>
                      {ATLAS_CITIES.filter((c) => c.region === r).map((c) => (
                        <li key={c.name}><button onClick={() => choose(c)}><MapPin size={14} />{c.name}<span>{c.country}</span></button></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {picking && <p className="atlas-note">Finding that place…</p>}
          </div>
          <aside className="atlas-panel" aria-live="polite">
            {pickError && <ErrorBox error={pickError} />}
            {!selected && (
              <>
                <h2>Explore our world</h2>
                <p className="dim">Click a diamond, click anywhere on the map, or search above. {city && <>You were last in <strong>{city.name}</strong>. <button className="linklike" onClick={() => go('explore')}>Open Explore</button></>}</p>
              </>
            )}
            {selected && (
              <>
                <p className="eyebrow">{selected.country || 'Selected'}</p>
                <h2>{selected.name}</h2>
                <button className="btn" onClick={() => go('explore')}>Explore {selected.name}<ArrowRight size={16} /></button>
                <h3 className="panel-sub">Places to start with</h3>
                {preview.loading && <Loading label="Finding places" />}
                {preview.error && <ErrorBox error={preview.error} onRetry={preview.reload} />}
                {!preview.loading && !preview.error && places.length === 0 && <p className="dim">No mapped attractions found nearby. Open Explore to try other categories.</p>}
                <ul className="atlas-places">
                  {places.map((p) => <li key={p.id}><strong>{p.name}</strong><span>{p.kind}</span></li>)}
                </ul>
                {places.length > 0 && <p className="fineprint"><SourceTag kind="osm">{preview.data.source}</SourceTag></p>}
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="section wrap">
        <h2>Make it yours</h2>
        <p className="lede">{active ? <>Saved on this device: {summarize(prefs).map((c) => <span className="chip-static" key={c}>{c}</span>)}</> : 'Tell TravelBuddy your budget, food needs and interests once. Places, Local Friend answers and itineraries will all use them.'}</p>
        <button className="btn ghost" onClick={openPanel}><SlidersHorizontal size={16} />{active ? 'Edit my travel style' : 'Set my travel style'}</button>
      </section>

      <section className="section wrap">
        <h2>Everything a good local friend would do</h2>
        <ul className="features">
          {FEATURES.map(({ id, icon: Icon, title, text }) => (
            <li key={id}>
              <button onClick={() => go(id)}>
                <Icon size={22} />
                <span><strong>{title}</strong><span className="sub">{text}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
