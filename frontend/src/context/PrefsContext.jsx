import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { EMPTY_PREFS, hasPrefs } from '../lib/prefs.js'

const PrefsContext = createContext(null)
const KEY = 'travelbuddy.prefs.v1'

const load = () => {
  try { return { ...EMPTY_PREFS, ...JSON.parse(localStorage.getItem(KEY)) } } catch { return EMPTY_PREFS }
}

export function PrefsProvider({ children }) {
  const [prefs, setPrefsState] = useState(load)
  const [open, setOpen] = useState(false)
  const setPrefs = useCallback((p) => {
    setPrefsState(p)
    try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode: still works for this session */ }
  }, [])
  const value = useMemo(() => ({ prefs, setPrefs, active: hasPrefs(prefs), open, openPanel: () => setOpen(true), closePanel: () => setOpen(false) }), [prefs, setPrefs, open])
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export const usePrefs = () => useContext(PrefsContext)
