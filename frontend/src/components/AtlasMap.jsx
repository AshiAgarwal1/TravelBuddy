import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const diamond = (active) => L.divIcon({
  className: 'pin-wrap',
  html: `<span class="atlas-pin ${active ? 'active' : ''}"></span>`,
  iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
})

function Fly({ city }) {
  const map = useMap()
  const last = useRef(null)
  useEffect(() => {
    if (!city) return
    const key = `${city.lat},${city.lon}`
    if (last.current === key) return
    last.current = key
    map.flyTo([city.lat, city.lon], Math.max(map.getZoom(), 11), { duration: 1.2 })
  }, [city?.lat, city?.lon]) // eslint-disable-line
  return null
}

function Clicks({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function AtlasMap({ cities, selected, places = [], onSelectCity, onPickPoint }) {
  return (
    <div className="atlas-map">
      <MapContainer center={[22, 15]} zoom={2} minZoom={2} maxZoom={16} scrollWheelZoom={false} worldCopyJump style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} className="atlas-tiles"
        />
        <Clicks onPick={onPickPoint} />
        <Fly city={selected} />
        {cities.map((c) => (
          <Marker key={c.display_name} position={[c.lat, c.lon]} icon={diamond(selected?.name === c.name)} title={c.display_name}
            eventHandlers={{ click: () => onSelectCity(c) }}>
            <Popup>{c.display_name}</Popup>
          </Marker>
        ))}
        {selected && !cities.some((c) => c.name === selected.name) && (
          <Marker position={[selected.lat, selected.lon]} icon={diamond(true)} title={selected.display_name} />
        )}
        {places.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={5} pathOptions={{ color: '#0F3A32', weight: 1.5, fillColor: '#E4C766', fillOpacity: 1 }}>
            <Popup><strong>{p.name}</strong><br />{p.kind}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
