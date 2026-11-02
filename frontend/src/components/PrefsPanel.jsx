import { useEffect, useRef, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { usePrefs } from '../context/PrefsContext.jsx'
import { INTERESTS, DIETS, BUDGETS, COMPANIONS, PACES, APPROACHES, EMPTY_PREFS } from '../lib/prefs.js'

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button type="button" key={v} className={value === v ? 'active' : ''} aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}>{l}</button>
      ))}
    </div>
  )
}

export default function PrefsPanel() {
  const { prefs, setPrefs, open, closePanel } = usePrefs()
  const [cuisineText, setCuisineText] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (open) { setCuisineText(prefs.cuisines.join(', ')); ref.current?.focus() } }, [open]) // eslint-disable-line
  useEffect(() => {
    if (!open) return undefined
    const esc = (e) => e.key === 'Escape' && closePanel()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, closePanel])
  if (!open) return null

  const set = (patch) => setPrefs({ ...prefs, ...patch })
  const commitCuisines = () => set({ cuisines: cuisineText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10) })

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && closePanel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="prefs-title">
        <div className="modal-head">
          <h2 id="prefs-title">Your travel style</h2>
          <button className="icon" ref={ref} onClick={closePanel} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="fineprint">Saved only on this device. It is used to rank places, shape Local Friend answers and build itineraries. Everything is optional.</p>

        <fieldset><legend>Travelling as</legend><Seg label="Travelling as" options={COMPANIONS} value={prefs.companions} onChange={(v) => set({ companions: v })} /></fieldset>
        <fieldset><legend>Budget</legend><Seg label="Budget" options={BUDGETS} value={prefs.budget} onChange={(v) => set({ budget: v })} /></fieldset>
        <fieldset><legend>Food needs</legend>
          <div className="chips">{DIETS.map((d) => <button type="button" key={d} className={`chip ${prefs.diet.includes(d) ? 'on' : ''}`} aria-pressed={prefs.diet.includes(d)} onClick={() => set({ diet: toggle(prefs.diet, d) })}>{d}</button>)}</div>
        </fieldset>
        <label className="field-label">Cuisines you love (comma separated)
          <input value={cuisineText} onChange={(e) => setCuisineText(e.target.value)} onBlur={commitCuisines} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commitCuisines())} placeholder="ramen, tapas, street food" maxLength={120} />
        </label>
        <fieldset><legend>Interests</legend>
          <div className="chips">{INTERESTS.map((i) => <button type="button" key={i} className={`chip ${prefs.interests.includes(i) ? 'on' : ''}`} aria-pressed={prefs.interests.includes(i)} onClick={() => set({ interests: toggle(prefs.interests, i) })}>{i}</button>)}</div>
        </fieldset>
        <fieldset><legend>Pace</legend><Seg label="Pace" options={PACES} value={prefs.pace} onChange={(v) => set({ pace: v })} /></fieldset>
        <fieldset><legend>Where to eat and go</legend><Seg label="Approach" options={APPROACHES} value={prefs.approach} onChange={(v) => set({ approach: v })} /></fieldset>
        <label className="check"><input type="checkbox" checked={prefs.step_free} onChange={(e) => set({ step_free: e.target.checked })} /> I need step-free (wheelchair accessible) places</label>

        <div className="modal-foot">
          <button className="btn ghost small" onClick={() => { setPrefs(EMPTY_PREFS); setCuisineText('') }}><RotateCcw size={14} />Clear all</button>
          <button className="btn small" onClick={() => { commitCuisines(); closePanel() }}>Done</button>
        </div>
      </div>
    </div>
  )
}
