import { useState, useRef, useEffect } from 'react'
import { ArrowLeftRight, Mic, MicOff, Volume2, Copy, Check, Loader2, Languages } from 'lucide-react'
import { useCity } from '../context/CityContext.jsx'
import { api } from '../services/api.js'
import { ErrorBox } from '../components/State.jsx'

const LANGS = [
  ['en', 'English', 'en-US'], ['es', 'Spanish', 'es-ES'], ['fr', 'French', 'fr-FR'], ['de', 'German', 'de-DE'], ['it', 'Italian', 'it-IT'],
  ['pt', 'Portuguese', 'pt-PT'], ['nl', 'Dutch', 'nl-NL'], ['pl', 'Polish', 'pl-PL'], ['tr', 'Turkish', 'tr-TR'], ['ru', 'Russian', 'ru-RU'],
  ['el', 'Greek', 'el-GR'], ['ar', 'Arabic', 'ar-SA'], ['he', 'Hebrew', 'he-IL'], ['hi', 'Hindi', 'hi-IN'], ['th', 'Thai', 'th-TH'],
  ['vi', 'Vietnamese', 'vi-VN'], ['id', 'Indonesian', 'id-ID'], ['ja', 'Japanese', 'ja-JP'], ['ko', 'Korean', 'ko-KR'], ['zh-CN', 'Chinese (Simplified)', 'zh-CN'],
  ['sv', 'Swedish', 'sv-SE'], ['cs', 'Czech', 'cs-CZ'],
]
const BY_COUNTRY = { es: 'es', mx: 'es', ar: 'es', co: 'es', cl: 'es', pe: 'es', fr: 'fr', de: 'de', at: 'de', it: 'it', pt: 'pt', br: 'pt', nl: 'nl', pl: 'pl', tr: 'tr', ru: 'ru', gr: 'el', eg: 'ar', ma: 'ar', ae: 'ar', sa: 'ar', il: 'he', in: 'hi', th: 'th', vn: 'vi', id: 'id', jp: 'ja', kr: 'ko', cn: 'zh-CN', se: 'sv', cz: 'cs' }
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const TTS = typeof window !== 'undefined' && 'speechSynthesis' in window
const speechCode = (c) => LANGS.find((l) => l[0] === c)?.[2] || c

export default function Translator() {
  const { city } = useCity()
  const [source, setSource] = useState('en')
  const [target, setTarget] = useState(BY_COUNTRY[city?.country_code] || 'es')
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [listening, setListening] = useState(false)
  const [copied, setCopied] = useState(false)
  const rec = useRef(null)

  useEffect(() => { if (BY_COUNTRY[city?.country_code]) setTarget(BY_COUNTRY[city.country_code]) }, [city?.country_code])
  useEffect(() => () => { rec.current?.stop(); TTS && window.speechSynthesis.cancel() }, [])

  const run = async (e) => {
    e?.preventDefault()
    if (!text.trim()) return
    setBusy(true); setError(null)
    try { setResult((await api.translate({ text: text.trim(), source, target })).text) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const swap = () => { setSource(target); setTarget(source); setText(result); setResult(text) }
  const listen = () => {
    if (listening) { rec.current?.stop(); return }
    if (!SR) { setError(new Error('Voice input is not supported in this browser. Try Chrome or Edge.')); return }
    const r = new SR()
    r.lang = speechCode(source)
    r.interimResults = true
    r.continuous = true
    r.maxAlternatives = 1
    let finalText = text ? text.trim() + ' ' : ''
    r.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript
        if (ev.results[i].isFinal) finalText += t + ' '
        else interim += t
      }
      setText((finalText + interim).trim())
    }
    r.onerror = (ev) => {
      const msg = {
        'not-allowed': 'Microphone permission was denied. Allow mic access and try again.',
        'no-speech': 'No speech detected. Speak clearly and try again.',
        'audio-capture': 'No microphone found.',
        'network': 'Speech recognition network error. Check your connection.',
        'aborted': null,
      }[ev.error] || `Voice input failed (${ev.error}).`
      if (msg) setError(new Error(msg))
      setListening(false)
    }
    r.onend = () => setListening(false)
    rec.current = r
    setError(null)
    setListening(true)
    try { r.start() } catch (e) { setListening(false); setError(new Error('Could not start voice input. Wait a second and try again.')) }
  }
  const speak = () => {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(result); u.lang = speechCode(target)
    window.speechSynthesis.speak(u)
  }
  const copy = async () => { try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { setError(new Error('Could not copy to the clipboard.')) } }

  const select = (value, onChange) => <select value={value} onChange={(e) => onChange(e.target.value)}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>

  return (
    <div className="wrap section narrow">
      <h1 className="page-title">Translator</h1>
      <p className="lede">{city ? `Set to the local language for ${city.name} where we know it.` : 'Translate phrases for your trip.'} Short phrases work best (500 characters max).</p>
      <form className="translator" onSubmit={run}>
        <div className="langs">
          {select(source, setSource)}
          <button type="button" className="icon" onClick={swap} aria-label="Swap languages"><ArrowLeftRight size={18} /></button>
          {select(target, setTarget)}
        </div>
        <div className="tbox">
          <textarea rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or speak what you want to say" aria-label="Text to translate" />
          <div className="tbar">
            {SR
              ? <button type="button" className={`btn ghost small ${listening ? 'live' : ''}`} onClick={listen}>{listening ? <MicOff size={15} /> : <Mic size={15} />}{listening ? 'Stop listening' : 'Speak'}</button>
              : <span className="fineprint">Voice input is not supported in this browser. Try Chrome or Edge.</span>}
            <span className="fineprint">{text.length}/500</span>
          </div>
        </div>
        <button className="btn" disabled={busy || !text.trim()}>{busy ? <Loader2 className="spin" size={16} /> : <Languages size={16} />}Translate</button>
      </form>
      {error && <ErrorBox error={error} />}
      {result && (
        <div className="tresult">
          <p lang={target}>{result}</p>
          <div className="tbar">
            {TTS ? <button className="btn ghost small" onClick={speak}><Volume2 size={15} />Play aloud</button> : <span className="fineprint">Voice output is not supported in this browser.</span>}
            <button className="btn ghost small" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
