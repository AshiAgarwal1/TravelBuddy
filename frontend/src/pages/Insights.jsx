import { Droplets, Wind, Thermometer, Sunrise, Sunset, Sparkles, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useCity } from '../context/CityContext.jsx'
import { useFetch } from '../hooks/useFetch.js'
import { api } from '../services/api.js'
import { Loading, ErrorBox, NeedCity } from '../components/State.jsx'

const day = (d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
const time = (s) => s?.slice(11, 16)

function List({ title, items }) {
  if (!items?.length) return null
  return <div><h3>{title}</h3><ul className="bullets">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
}

export default function Insights() {
  const { city } = useCity()
  const wx = useFetch((s) => api.weather(city.lat, city.lon, s), [city?.lat, city?.lon], { enabled: !!city })
  const about = useFetch((s) => api.city(city.name, city.region, s), [city?.name], { enabled: !!city })
  const [wantTips, setWantTips] = useState(false)
  const tips = useFetch((s) => api.insights(city.name, city.country, s), [city?.name, wantTips], { enabled: !!city && wantTips })
  if (!city) return <div className="wrap section"><NeedCity feature="Local Insights" /></div>
  const c = wx.data?.current

  return (
    <div className="wrap section">
      <h1 className="page-title">Local insights for {city.name}</h1>

      <section className="block">
        <h2>Weather</h2>
        {wx.loading && <Loading label="Fetching the forecast" />}
        {wx.error && <ErrorBox error={wx.error} onRetry={wx.reload} />}
        {c && (
          <>
            <div className="now">
              <div className="temp">{Math.round(c.temperature_2m)}°<span>{c.label}</span></div>
              <ul className="facts">
                <li><Thermometer size={16} />Feels like {Math.round(c.apparent_temperature)}°C</li>
                <li><Droplets size={16} />Humidity {c.relative_humidity_2m}%</li>
                <li><Wind size={16} />Wind {c.wind_speed_10m} km/h</li>
              </ul>
            </div>
            <div className="forecast">
              {wx.data.daily.map((d) => (
                <div key={d.date} className="fday">
                  <strong>{day(d.date)}</strong>
                  <span>{d.label}</span>
                  <span>{Math.round(d.max)}° / {Math.round(d.min)}°</span>
                  <span className="sub">{d.rain_chance ?? '?'}% rain</span>
                </div>
              ))}
            </div>
            <p className="fineprint"><Sunrise size={14} /> {time(wx.data.daily[0].sunrise)} <Sunset size={14} /> {time(wx.data.daily[0].sunset)} (local time)</p>
          </>
        )}
      </section>

      <section className="block">
        <h2>About {city.name}</h2>
        {about.loading && <Loading />}
        {about.error && <ErrorBox error={about.error} onRetry={about.reload} />}
        {about.data && (about.data.extract
          ? <p className="prose">{about.data.extract}</p>
          : <p className="fineprint">No encyclopedia summary is available for this place.</p>)}
      </section>

      <section className="block">
        <h2>Opening hours and local tips</h2>
        {!wantTips && <button className="btn" onClick={() => setWantTips(true)}><Sparkles size={16} />Generate local tips</button>}
        {wantTips && tips.loading && <Loading label="Gathering local knowledge" />}
        {tips.error && <ErrorBox error={tips.error} onRetry={tips.reload} />}
        {tips.data && (
          <>
            <p className="notice">{tips.data.label}</p>
            {tips.data.opening_hours?.length > 0 && (
              <table className="hours"><tbody>{tips.data.opening_hours.map((h, i) => <tr key={i}><th>{h.what}</th><td>{h.typical}</td></tr>)}</tbody></table>
            )}
            <div className="cols">
              <List title="Good to know" items={tips.data.tips} />
              <List title="Etiquette" items={tips.data.etiquette} />
              <List title="Money" items={tips.data.money} />
              <List title="Getting around" items={tips.data.getting_around} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
