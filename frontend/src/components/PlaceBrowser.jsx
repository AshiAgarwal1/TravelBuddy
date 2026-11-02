import { useEffect, useRef, useState } from 'react'
import { List, Map as MapIcon, Navigation, Footprints, Bike, Car, Loader2, Clock } from 'lucide-react'
import MapView from './MapView.jsx'
import PlaceCard from './PlaceCard.jsx'
import { Loading, ErrorBox } from './State.jsx'
import { SourceTag } from './Source.jsx'
import { api, isAbort } from '../services/api.js'
import { fmtKm, fmtDuration, directionsUrl } from '../lib/geo.js'

const MODES = [['foot', 'Walk', Footprints], ['bike', 'Bike', Bike], ['car', 'Drive', Car]]

/** List + map that stay in sync, with a route option for the selected place. Shared by Explore and Local Help. */
export default function PlaceBrowser({ places, loading, error, onRetry, loadingLabel, empty, notice, center, origin, onLocate, locating, resetKey, defaultMode = 'foot' }) {
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('list')
  const [mode, setMode] = useState(defaultMode)
  const [route, setRoute] = useState(null) // { loading, error, data, forId }
  const routeCtrl = useRef(null)
  const listRef = useRef(null)

  useEffect(() => { setSelectedId(null); setRoute(null) }, [resetKey])
  useEffect(() => { setRoute(null); routeCtrl.current?.abort() }, [selectedId, mode, origin?.lat, origin?.lon])
  useEffect(() => () => routeCtrl.current?.abort(), [])

  const selected = places.find((p) => p.id === selectedId) || null

  const select = (id, { scroll = true } = {}) => {
    setSelectedId(id)
    if (scroll) requestAnimationFrame(() => document.getElementById(`place-${id.replace('/', '-')}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const getRoute = () => {
    routeCtrl.current?.abort()
    const ctrl = (routeCtrl.current = new AbortController())
    setRoute({ loading: true, forId: selected.id })
    api.route({ from: origin, to: selected, mode }, ctrl.signal).then(
      (data) => setRoute({ data, forId: selected.id }),
      (error) => { if (!isAbort(error)) setRoute({ error, forId: selected.id }) },
    )
  }

  const routeData = route?.data && route.forId === selected?.id ? route.data : null

  return (
    <>
      <div className="viewtoggle" role="tablist" aria-label="Show list or map">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} />List{places.length ? ` (${places.length})` : ''}</button>
        <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><MapIcon size={15} />Map</button>
      </div>
      <div className="explore" data-view={view}>
        <div className="list" ref={listRef}>
          {notice}
          {loading && places.length === 0 && (
            <div className="skeleton-list" aria-busy="true" aria-label={loadingLabel || 'Loading places'}>
              {[1, 2, 3, 4].map((n) => <div key={n} className="skeleton-card" />)}
              <p className="dim skeleton-hint">{loadingLabel || 'Finding places…'}</p>
            </div>
          )}
          {error && places.length === 0 && <ErrorBox error={error} onRetry={onRetry} />}
          {!loading && !error && places.length === 0 && empty}
          {places.map((p, i) => (
            <PlaceCard key={p.id} place={p} index={i} active={p.id === selectedId} origin={origin}
              onSelect={() => select(p.id, { scroll: false })} onShowMap={() => { select(p.id, { scroll: false }); setView('map') }} />
          ))}
        </div>

        <div className="map-col">
          <MapView center={center} places={places} selectedId={selectedId} onSelect={(id) => select(id)} origin={origin}
            route={routeData} onLocate={onLocate} locating={locating} />
          <div className="map-selected" aria-live="polite">
            {!selected && <p className="dim">{places.length ? 'Tap a numbered marker or a place in the list to see it here.' : 'Nothing to show on the map yet.'}</p>}
            {selected && (
              <>
                <div className="ms-head"><strong>{places.indexOf(selected) + 1}. {selected.name}</strong>{selected.distance_km != null && <span className="dist">{fmtKm(selected.distance_km)}</span>}</div>
                <p className="kind">{selected.kind}{selected.address ? `, ${selected.address}` : ''}</p>
                <p className="meta"><Clock size={14} />{selected.opening_hours ? <>{selected.opening_hours} <em>(as mapped)</em></> : 'Opening hours not mapped'}</p>
                <div className="route-row">
                  <div className="seg small" role="group" aria-label="Travel mode">
                    {MODES.map(([id, label, Icon]) => <button key={id} className={mode === id ? 'active' : ''} aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={14} />{label}</button>)}
                  </div>
                  <button className="btn small" onClick={getRoute} disabled={!origin?.isUser || route?.loading}>
                    {route?.loading ? <Loader2 className="spin" size={14} /> : <Navigation size={14} />}Show route
                  </button>
                  <a className="btn ghost small" href={directionsUrl(selected, origin)} target="_blank" rel="noreferrer">Open in Maps</a>
                </div>
                {!origin?.isUser && <p className="fineprint">Routes start from your real location, so we never guess one. {onLocate ? 'Use the location button on the map to enable them.' : ''}</p>}
                {route?.error && route.forId === selected.id && <p className="route-err">{route.error.message} You can still open it in Maps.</p>}
                {routeData && (
                  <p className="route-ok">
                    <strong>{fmtKm(routeData.distance_m / 1000)}</strong> by {MODES.find((m) => m[0] === routeData.mode)[1].toLowerCase()}, about <strong>{fmtDuration(routeData.duration_s)}</strong>{' '}
                    <SourceTag kind="estimate">{routeData.duration_is_estimate ? 'Time is an estimate' : 'Estimate'}</SourceTag>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
