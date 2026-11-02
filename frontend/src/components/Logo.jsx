/** TravelBuddy mark: a soft, hand-drawn "T" holding contour lines, with a small companion pebble walking beside it. */
export function LogoMark({ size = 36 }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="TravelBuddy">
      <rect width="64" height="64" rx="14" fill="#0F3A32" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19c0-4 4-6 20-6s20 2 20 6-3 6-9 7c-3 .5-5 1-5 4v14c0 8-4 12-9 12s-9-4-9-12V30c0-3-2-3.5-5-4-6-1-9-3-9-7z" stroke="#E4C766" strokeWidth="3" />
        <path d="M20 21c5-2 12-1 15 2s-1 6-6 7" stroke="#E4C766" strokeWidth="1.5" />
        <path d="M31 41c3-3 7-1 6 3s-6 5-8 2" stroke="#fff" strokeWidth="1.5" />
      </g>
      <ellipse cx="49" cy="29" rx="5" ry="3.5" transform="rotate(-25 49 29)" fill="#0F3A32" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

export default function Logo({ size = 34 }) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      <span className="wordmark">Travel<em>Buddy</em></span>
    </span>
  )
}
