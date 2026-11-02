import { useState, useCallback } from 'react'

/** Browser location on demand (never automatically). Returns { pos, status, error, locate }. */
export function useGeolocation() {
  const [pos, setPos] = useState(null)
  const [status, setStatus] = useState('idle') // idle | locating | ok | denied | error
  const [error, setError] = useState(null)

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setStatus('error'); setError('Your browser does not support location.'); return }
    setStatus('locating'); setError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, isUser: true }); setStatus('ok') },
      (e) => {
        setStatus(e.code === 1 ? 'denied' : 'error')
        setError(e.code === 1 ? 'Location permission was denied, so results stay centred on the city.' : 'Could not get your location, so results stay centred on the city.')
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    )
  }, [])
  const clear = useCallback(() => { setPos(null); setStatus('idle'); setError(null) }, [])
  return { pos, status, error, locate, clear }
}
