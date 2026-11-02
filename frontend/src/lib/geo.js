export function haversineKm(a, b) {
  const p = Math.PI / 180
  const x = 0.5 - Math.cos((b.lat - a.lat) * p) / 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * (1 - Math.cos((b.lon - a.lon) * p)) / 2
  return 12742 * Math.asin(Math.sqrt(x))
}

export const fmtKm = (km) => (km == null ? '' : km < 1 ? `${Math.round(km * 10) * 100} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`)

export const fmtDuration = (s) => {
  const m = Math.max(1, Math.round(s / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export const directionsUrl = (p, origin) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}${origin?.isUser ? `&origin=${origin.lat},${origin.lon}` : ''}`

// Beyond this distance a browser location is not "in" the chosen city, so we do not centre the city's results on it.
export const NEAR_CITY_KM = 60
