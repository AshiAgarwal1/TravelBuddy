import { useState, useEffect, useRef, useCallback } from 'react'
import { isAbort } from '../services/api.js'

/**
 * useFetch((signal) => api.something(..., signal), deps, { enabled })
 * Cancels the previous request when deps change or the component unmounts, and ignores stale responses.
 */
export function useFetch(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null }); return undefined }
    const ctrl = new AbortController()
    setState({ data: null, loading: true, error: null })
    fnRef.current(ctrl.signal).then(
      (data) => { if (!ctrl.signal.aborted) setState({ data, loading: false, error: null }) },
      (error) => { if (!isAbort(error) && !ctrl.signal.aborted) setState({ data: null, loading: false, error }) },
    )
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
