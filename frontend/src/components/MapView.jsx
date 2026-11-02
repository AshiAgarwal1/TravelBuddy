import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, Maximize2 } from 'lucide-react'
import { fmtKm } from '../lib/geo.js'

const iconCache = new Map()
const pinIcon = (n, active) => {
  const key = `${n}:${active}`
  if (!iconCache.has(key)) {
    iconCache.set(key, L.divIcon({
      className: 'pin-wrap',
      html: `<span class="pin ${active ? 'active' : ''}"><b>${n}</b></span>`,
      iconSize: active ? [34, 34] : [28, 28], iconAnchor: active ? [17, 34] : [14, 28], popupAnchor: [0, -28],
    }))
  }
  return iconCache.get(key)
}
const centerIcon = L.divIcon({ className: 'pin-wrap', html: '<span class="dot center" title="City centre"></span>', iconSize: [16, 16], iconAnchor: [8, 8] })
const userIcon = L.divIcon({ className: 'pin-wrap', html: '<span class="dot user"></span>', iconSize: [18, 18], iconAnchor: [9, 9] })

/** Keeps the view sensible: fit everything when the result set changes, fly to the selection, never fight the user. */
function Camera({ center, origin, places, selected, route, markers, fitKey, recenterToken }) {
  const map = useMap()
  const lastFit = useRef('')
  const onShow = useRef(() => {})

  const fitAll = (animate = true) => {
    const pts = places.map((p) => [p.lat, p.lon])
    if (origin?.isUser) pts.push([origin.lat, origin.lon])
    if (pts.length === 0) { map.setView(center, 13, { animate }); return }
    if (pts.length === 1) { map.setView(pts[0], 15, { animate }); return }
    pts.push(center)
    map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16, animate })
  }

  useEffect(() => {
    if (lastFit.current === fitKey) return
    lastFit.current = fitKey
    fitAll(false)
  }, [fitKey]) // eslint-disable-line

  useEffect(() => { if (recenterToken) fitAll(true) }, [recenterToken]) // eslint-disable-line

  useEffect(() => {
    if (!selected) return
    const open = () => markers.current[selected.id]?.openPopup()
    map.once('moveend', open)
    map.flyTo([selected.lat, selected.lon], Math.max(map.getZoom(), 15), { duration: 0.5 })
    const t = setTimeout(open, 650)   // moveend does not fire if already there
    return () => { clearTimeout(t); map.off('moveend', open) }
  }, [selected?.id]) // eslint-disable-line

  useEffect(() => {
    if (route?.points?.length > 1) map.fitBounds(L.latLngBounds(route.points), { padding: [40, 40], maxZoom: 17 })
  }, [route]) // eslint-disable-line

  // When the map becomes visible (mobile list/map toggle) re-apply the right view; the size it was created with was 0.
  onShow.current = () => {
    if (selected) { map.setView([selected.lat, selected.lon], Math.max(map.getZoom(), 15), { animate: false }); markers.current[selected.id]?.openPopup() }
    else fitAll(false)
  }
  useEffect(() => {
    const el = map.getContainer()
    let hidden = el.clientWidth === 0
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
      const nowHidden = el.clientWidth === 0
      if (hidden && !nowHidden) onShow.current()
      hidden = nowHidden
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  return null
}

/** Scroll-wheel zoom only after the map is clicked, so the page can still scroll past it. */
function WheelGuard() {
  const map = useMap()
  useMapEvents({ click: () => map.scrollWheelZoom.enable(), mouseout: () => map.scrollWheelZoom.disable() })
  return null
}

function Controls({ onLocate, onFit, locating, hasUser }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) { L.DomEvent.disableClickPropagation(ref.current); L.DomEvent.disableScrollPropagation(ref.current) } }, [])
  return (
    <div className="map-controls" ref={ref}>
      <button onClick={onFit} aria-label="Show all places" title="Show all places"><Maximize2 size={16} /></button>
      {onLocate && <button onClick={onLocate} aria-label="Use my location" title={hasUser ? 'Update my location' : 'Use my location'} className={hasUser ? 'on' : ''} disabled={locating}><Crosshair size={16} /></button>}
    </div>
  )
}

export default function MapView({ center, places = [], selectedId, onSelect, origin, route, onLocate, locating, className = '' }) {
  const markers = useRef({})
  const selected = places.find((p) => p.id === selectedId) || null
  const fitKey = useMemo(() => `${center[0].toFixed(3)},${center[1].toFixed(3)}|${places.map((p) => p.id).join(',')}|${origin?.isUser ? 'u' : 'c'}`, [center, places, origin?.isUser])
  const [recenter, setRecenter] = useState(0)

  return (
    <div className={`mapbox ${className}`}>
      <MapContainer center={center} zoom={13} minZoom={2} maxZoom={19} scrollWheelZoom={false} zoomControl style={{ height: '100%', width: '100%' }} worldCopyJump>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} keepBuffer={4} detectRetina={false}
        />
        <WheelGuard />
        {!origin?.isUser && <Marker position={center} icon={centerIcon} interactive={false} keyboard={false} />}
        {origin?.isUser && (
          <>
            {origin.accuracy && origin.accuracy < 3000 && <Circle center={[origin.lat, origin.lon]} radius={origin.accuracy} pathOptions={{ color: '#2b6cb0', weight: 1, fillOpacity: 0.08 }} />}
            <Marker position={[origin.lat, origin.lon]} icon={userIcon} interactive={false} keyboard={false} />
          </>
        )}
        {route?.points?.length > 1 && (
          <>
            <Polyline positions={route.points} pathOptions={{ color: '#fff', weight: 8, opacity: 0.9 }} />
            <Polyline positions={route.points} pathOptions={{ color: '#C77B5B', weight: 4.5 }} />
          </>
        )}
        {places.map((p, i) => (
          <Marker
            key={p.id} position={[p.lat, p.lon]} icon={pinIcon(i + 1, p.id === selectedId)} zIndexOffset={p.id === selectedId ? 1000 : 0}
            ref={(m) => { if (m) markers.current[p.id] = m; else delete markers.current[p.id] }}
            eventHandlers={{ click: () => onSelect?.(p.id) }} title={p.name} keyboard
          >
            <Popup autoPanPadding={[30, 30]}>
              <strong>{i + 1}. {p.name}</strong><br />{p.kind}{p.distance_km != null ? ` · ${fmtKm(p.distance_km)}` : ''}
            </Popup>
          </Marker>
        ))}
        <Camera center={center} origin={origin} places={places} selected={selected} route={route} markers={markers} fitKey={fitKey} recenterToken={recenter} />
        <Controls onLocate={onLocate} onFit={() => setRecenter((n) => n + 1)} locating={locating} hasUser={!!origin?.isUser} />
      </MapContainer>
    </div>
  )
}
