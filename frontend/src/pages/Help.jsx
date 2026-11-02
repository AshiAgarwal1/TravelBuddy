import { useState, useEffect } from 'react'
import { Siren, Cross, Pill, Stethoscope, Shield, Crosshair, Phone, MapPin } from 'lucide-react'
import { useCity } from '../context/CityContext.jsx'
import { useFetch } from '../hooks/useFetch.js'
import { useGeolocation } from '../hooks/useGeolocation.js'
import { api } from '../services/api.js'
import { haversineKm, NEAR_CITY_KM } from '../lib/geo.js'
import PlaceBrowser from '../components/PlaceBrowser.jsx'
import { Loading, ErrorBox, Empty, NeedCity } from '../components/State.jsx'

const GROUPS = [
  { id: 'hospitals', label: 'Hospitals', icon: Cross },
  { id: 'pharmacies', label: 'Pharmacies', icon: Pill },
  { id: 'clinics', label: 'Clinics and doctors', icon: Stethoscope },
  { id: 'police', label: 'Police', icon: Shield },
]
const NUM_LABELS = { general: 'Emergency (all services)', police: 'Police', ambulance: 'Ambulance', fire: 'Fire' }
const RADIUS = 6000

export default function Help() {
  const { city } = useCity()
  const geo = useGeolocation()
  const [group, setGroup] = useState('hospitals')
  useEffect(() => { geo.clear() }, [city?.lat, city?.lon]) // eslint-disable-line

  // In an emergency the real location matters more than the chosen city. If the user is far from the city,
  // help is searched around them and the country is looked up from their coordinates.
  const farAway = !!(geo.pos && city && haversineKm(geo.pos, city) > NEAR_CITY_KM)
  const here = useFetch((s) => api.reverse(geo.pos.lat, geo.pos.lon, s), [geo.pos?.lat, geo.pos?.lon], { enabled: farAway })
  const around = geo.pos && (!farAway || here.data) ? geo.pos : city && { lat: city.lat, lon: city.lon, isUser: false }
  const countryCode = farAway ? here.data?.country_code : city?.country_code

  // 1) Emergency numbers: static list on our server. Never waits for, or fails with, the map data.
  const nums = useFetch((s) => api.helpNumbers(countryCode, s), [countryCode], { enabled: !!city && (!farAway || !!here.data || !!here.error) })
  // 2) Only the selected category is fetched, and each category is cached independently.
  const places = useFetch(
    (s) => api.helpPlaces({ lat: around.lat, lon: around.lon, category: group, radius: RADIUS, origin: around }, s),
    [around?.lat, around?.lon, group], { enabled: !!city && !!around && (!farAway || !!here.data) },
  )
  if (!city) return <div className="wrap section"><NeedCity feature="Local Help" /></div>

  const n = nums.data?.emergency_numbers
  const label = GROUPS.find((g) => g.id === group).label.toLowerCase()

  return (
    <div className="wrap section">
      <h1 className="page-title">Local help in {farAway && here.data?.name ? here.data.name : city.name}</h1>
      <section className="emergency">
        <h2><Siren size={20} />Emergency numbers</h2>
        {nums.loading && <Loading label="Loading numbers" />}
        {nums.error && <ErrorBox error={nums.error} onRetry={nums.reload} />}
        {nums.data && (n
          ? <ul className="numbers">{Object.entries(n).map(([k, v]) => <li key={k}><Phone size={18} color="var(--terra)" /><span>{NUM_LABELS[k] || k}</span><strong>{v}</strong></li>)}</ul>
          : <p>No emergency number is listed for {farAway ? (here.data?.country || 'this country') : (city.country || 'this country')} in our reference. Look it up before you travel. <strong>112</strong> works on mobile networks in many countries, but not all.</p>)}
      </section>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {GROUPS.map(({ id, label: l, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={group === id} className={group === id ? 'active' : ''} onClick={() => setGroup(id)}><Icon size={16} />{l}</button>
          ))}
        </div>
        <button className="btn ghost small" onClick={geo.locate} disabled={geo.status === 'locating'}><Crosshair size={15} />{geo.pos ? 'Update my location' : 'Use my location'}</button>
      </div>
      <p className="fineprint"><MapPin size={14} />Searching within {RADIUS / 1000} km of {around?.isUser ? 'your location' : 'the city centre'}.</p>
      {geo.error && <ErrorBox error={new Error(geo.error)} />}
      {farAway && <p className="notice">You are far from {city.name}, so help is searched around your actual location{here.data?.name ? ` (near ${here.data.name})` : ''}.</p>}
      {farAway && here.error && <p className="notice">Could not work out your country, so local numbers are not shown. Search for your current city to see them.</p>}
      {places.data?.stale && <p className="notice">The map service is not responding, so this is a saved list from earlier. Call ahead if it is urgent.</p>}

      {around && (
        <PlaceBrowser
          places={places.data?.places || []} loading={places.loading || (farAway && here.loading)} error={places.error} onRetry={places.reload}
          resetKey={`${group}|${around.lat}|${around.lon}`} loadingLabel={`Finding ${label} nearby`} defaultMode="car"
          center={[around.lat, around.lon]} origin={around} onLocate={geo.locate} locating={geo.status === 'locating'}
          empty={<Empty title="Nothing mapped nearby">OpenStreetMap lists no {label} within {RADIUS / 1000} km. Coverage varies by region, so also check an official source or ask your accommodation.</Empty>}
        />
      )}
    </div>
  )
}
