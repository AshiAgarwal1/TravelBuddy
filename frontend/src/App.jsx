import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import LocalFriend from './pages/LocalFriend.jsx'
import Planner from './pages/Planner.jsx'
import Insights from './pages/Insights.jsx'
import Help from './pages/Help.jsx'
import Translator from './pages/Translator.jsx'
import Community from './pages/Community.jsx'
import PrefsPanel from './components/PrefsPanel.jsx'

const PAGES = { home: Home, explore: Explore, friend: LocalFriend, planner: Planner, insights: Insights, help: Help, translator: Translator, community: Community }
const read = () => { const h = window.location.hash.replace('#/', '').replace('#', ''); return PAGES[h] ? h : 'home' }

export default function App() {
  const [page, setPage] = useState(read)
  useEffect(() => {
    const on = () => { setPage(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (id) => { window.location.hash = '#/' + id }
  const Page = PAGES[page]
  return (
    <>
      <Header page={page} go={go} />
      <main><Page go={go} /></main>
      <PrefsPanel />
    </>
  )
}
