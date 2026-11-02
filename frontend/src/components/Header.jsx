import { useState } from 'react'
import { Compass, MessageCircle, CalendarDays, CloudSun, LifeBuoy, Languages, Users, Menu, X, MapPin, SlidersHorizontal } from 'lucide-react'
import { useCity } from '../context/CityContext.jsx'
import { usePrefs } from '../context/PrefsContext.jsx'
import Logo from './Logo.jsx'

export const NAV = [
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'friend', label: 'Local Friend', icon: MessageCircle },
  { id: 'planner', label: 'Trip Planner', icon: CalendarDays },
  { id: 'insights', label: 'Insights', icon: CloudSun },
  { id: 'help', label: 'Local Help', icon: LifeBuoy },
  { id: 'translator', label: 'Translator', icon: Languages },
  { id: 'community', label: 'Community', icon: Users },
]

export default function Header({ page, go }) {
  const { city } = useCity()
  const { active, openPanel } = usePrefs()
  const [open, setOpen] = useState(false)
  const nav = (id) => { go(id); setOpen(false) }
  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" onClick={() => nav('home')} aria-label="TravelBuddy home"><Logo /></button>
        <nav className={open ? 'open' : ''} aria-label="Main">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => nav(id)}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
        <button className="citychip" onClick={() => nav('home')} title="Change city">
          <MapPin size={15} />{city ? city.name : 'Choose a city'}
        </button>
        <button className={`citychip prefchip ${active ? 'on' : ''}`} onClick={openPanel} title="Your travel style" aria-label="Your travel style">
          <SlidersHorizontal size={15} /><span className="prefchip-label">{active ? 'My style' : 'Set style'}</span>
        </button>
        <button className="menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  )
}
