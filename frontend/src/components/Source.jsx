import { Database, Sparkles, Calculator, UserRound, MessageSquare, BookOpen } from 'lucide-react'

const KINDS = {
  osm: { label: 'Source data', Icon: Database, hint: 'Mapped in OpenStreetMap by contributors. Not independently verified, so confirm before you go.' },
  estimate: { label: 'Estimate', Icon: Calculator, hint: 'Calculated or approximated. Real life will differ.' },
  ai: { label: 'AI suggestion', Icon: Sparkles, hint: 'Written by an AI model. It may be wrong, so verify it.' },
  reddit: { label: 'Reddit', Icon: MessageSquare, hint: 'An individual Reddit user\'s opinion. Useful, but not verified.' },
  wikivoyage: { label: 'Wikivoyage', Icon: BookOpen, hint: 'Community-written travel guide.' },
  pref: { label: 'Your preferences', Icon: UserRound, hint: 'Matched against the preferences you saved on this device.' },
}

export function SourceTag({ kind, children }) {
  const k = KINDS[kind]
  return <span className={`src src-${kind}`} title={k.hint}><k.Icon size={11} aria-hidden="true" />{children || k.label}</span>
}
