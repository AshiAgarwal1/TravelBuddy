import { Loader2, AlertCircle, Compass } from 'lucide-react'
import CitySearch from './CitySearch.jsx'

export function Loading({ label = 'Loading' }) {
  return <div className="state" role="status"><Loader2 className="spin" size={20} /><span>{label}</span></div>
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="state error" role="alert">
      <AlertCircle size={20} />
      <div>
        <p>{error?.message || String(error)}</p>
        {onRetry && <button className="btn ghost small" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="state empty">
      <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
    </div>
  )
}

export function NeedCity({ feature }) {
  return (
    <div className="need-city">
      <Compass size={28} />
      <h2>Choose a city to get started</h2>
      <p>{feature} works city by city. Search for anywhere in the world.</p>
      <CitySearch />
    </div>
  )
}
