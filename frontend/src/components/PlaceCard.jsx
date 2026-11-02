import { Clock, Globe, Phone, Mail, Navigation, ExternalLink, Accessibility, Leaf, MapPinned, CheckCircle2, AlertTriangle } from 'lucide-react'
import { fmtKm, directionsUrl } from '../lib/geo.js'
import { SourceTag } from './Source.jsx'

const DIET_LABEL = (tags = {}) => Object.entries(tags).filter(([k, v]) => k.startsWith('diet:') && (v === 'yes' || v === 'only')).map(([k, v]) => `${k.slice(5).replace('_', '-')}${v === 'only' ? ' only' : ''}`)
const WHEELCHAIR = { yes: 'Wheelchair accessible', limited: 'Partly wheelchair accessible', no: 'Not wheelchair accessible' }

export default function PlaceCard({ place, index, active, onSelect, onShowMap, origin, distanceLabel }) {
  const stop = (e) => e.stopPropagation()
  const fallback = { geoapify: 'Geoapify', opentripmap: 'OpenTripMap' }[place.source]
  const diets = DIET_LABEL(place.tags)
  const reasons = place.match?.reasons || []
  const cautions = place.match?.cautions || []
  const personalised = place.match?.personalized
  const fromWhere = origin?.isUser ? 'your location' : 'the city centre'

  return (
    <article className={`place ${active ? 'active' : ''}`} id={`place-${place.id.replace('/', '-')}`} aria-current={active || undefined}>
      <button className="place-hit" onClick={onSelect} aria-label={`Select ${place.name}`}>
        <span className="num">{index + 1}</span>
        <span className="place-title">
          <span className="place-head"><h3>{place.name}</h3>{place.distance_km != null && <span className="dist" title={`Straight-line distance from ${fromWhere}. Walking or driving distance is longer.`}>{fmtKm(place.distance_km)}</span>}</span>
          <span className="kind">{place.kind}{place.address ? `, ${place.address}` : ''}</span>
        </span>
      </button>

      {place.description && <p className="desc">{place.description}</p>}

      {(reasons.length > 0 || cautions.length > 0) && (
        <div className="why">
          {reasons.length > 0 && (
            <>
              <p className="why-title"><CheckCircle2 size={14} />{personalised ? 'Why it fits you' : 'What we know'}</p>
              <ul>{reasons.map((r, i) => <li key={i}>{r.text}{r.source === 'pref' && <SourceTag kind="pref" />}</li>)}</ul>
            </>
          )}
          {cautions.length > 0 && <ul className="cautions">{cautions.map((c, i) => <li key={i}><AlertTriangle size={13} />{c}</li>)}</ul>}
        </div>
      )}

      <ul className="facts-row">
        <li className={place.opening_hours ? '' : 'dim'}><Clock size={14} />{place.opening_hours ? <>{place.opening_hours} <em>(as mapped)</em></> : 'Opening hours not mapped'}</li>
        {place.phone && <li><Phone size={14} /><a href={`tel:${place.phone}`} onClick={stop}>{place.phone}</a></li>}
        {place.email && <li><Mail size={14} /><a href={`mailto:${place.email}`} onClick={stop}>{place.email}</a></li>}
        {place.website && <li><Globe size={14} /><a href={place.website} target="_blank" rel="noreferrer" onClick={stop}>Website</a></li>}
        {WHEELCHAIR[place.wheelchair] && <li><Accessibility size={14} />{WHEELCHAIR[place.wheelchair]}</li>}
        {diets.length > 0 && <li><Leaf size={14} />Mapped diets: {diets.join(', ')}</li>}
        {place.tags?.charge && <li>Entry charge as mapped: {place.tags.charge}</li>}
      </ul>

      <div className="links">
        {onShowMap && <button className="linklike show-map" onClick={(e) => { stop(e); onShowMap() }}><MapPinned size={14} />Show on map</button>}
        <a href={directionsUrl(place, origin)} target="_blank" rel="noreferrer" onClick={stop}><Navigation size={14} />Directions</a>
        <a href={place.osm_url} target="_blank" rel="noreferrer" onClick={stop}><ExternalLink size={14} />{fallback ? 'View on map' : 'OpenStreetMap'}</a>
      </div>
    </article>
  )
}
