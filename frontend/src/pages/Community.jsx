import { ExternalLink } from 'lucide-react'
import { useCity } from '../context/CityContext.jsx'
import { useFetch } from '../hooks/useFetch.js'
import { api } from '../services/api.js'
import { Loading, NeedCity } from '../components/State.jsx'
import { SourceTag } from '../components/Source.jsx'

const enc = encodeURIComponent
const searchLinks = (city) => [
  ['Reddit: all of Reddit', `https://www.reddit.com/search/?q=${enc(city + ' travel tips')}`],
  ['Reddit: r/travel', `https://www.reddit.com/r/travel/search/?q=${enc(city)}&restrict_sr=1`],
  ['Reddit: r/solotravel', `https://www.reddit.com/r/solotravel/search/?q=${enc(city)}&restrict_sr=1`],
  ['Google: Reddit threads', `https://www.google.com/search?q=${enc(city + ' travel tips site:reddit.com')}`],
  ['Tripadvisor forums', `https://www.tripadvisor.com/Search?q=${enc(city)}`],
  ['Wikivoyage guide', `https://en.wikivoyage.org/wiki/${enc(city.replace(/ /g, '_'))}`],
]

export default function Community() {
  const { city } = useCity()
  const { data, loading } = useFetch((s) => api.community(city.name, city.country, s), [city?.name, city?.country], { enabled: !!city })
  if (!city) return <div className="wrap section"><NeedCity feature="Community" /></div>
  const found = data?.sources || []

  return (
    <div className="wrap section narrow">
      <h1 className="page-title">What travellers say about {city.name}</h1>
      <p className="lede">Real discussions and guides. Every link opens the original page in a new tab.</p>

      <section className="block">
        <h2>Search the discussions</h2>
        <ul className="posts">
          {searchLinks(city.name).map(([label, url]) => (
            <li key={label}>
              <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /><span>{label}</span></a>
            </li>
          ))}
        </ul>
      </section>

      <section className="block">
        <h2>Threads and guides we found</h2>
        {loading && <Loading label="Looking for threads" />}
        {!loading && found.length === 0 && <p className="dim">Nothing was found automatically. Use the search links above.</p>}
        <ul className="posts">
          {found.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                <span>{s.title}<small><SourceTag kind={s.type} /> {s.meta}</small></span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
