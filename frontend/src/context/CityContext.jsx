import { createContext, useContext, useState, useCallback } from 'react'

const CityContext = createContext(null)
const KEY = 'travelbuddy.city'

export function CityProvider({ children }) {
  const [city, setCityState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
  })
  const setCity = useCallback((c) => {
    setCityState(c)
    try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY) } catch { /* ignore */ }
  }, [])
  return <CityContext.Provider value={{ city, setCity }}>{children}</CityContext.Provider>
}

export const useCity = () => useContext(CityContext)
