export const INTERESTS = ['Food', 'History', 'Art and museums', 'Nature', 'Nightlife', 'Shopping', 'Architecture', 'Local culture', 'Photography', 'Wellness']
export const DIETS = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten-free']
export const BUDGETS = [['budget', 'Budget'], ['mid-range', 'Mid-range'], ['luxury', 'Luxury']]
export const COMPANIONS = [['solo', 'Solo'], ['couple', 'Couple'], ['friends', 'Friends'], ['family', 'Family with kids'], ['business', 'Business']]
export const PACES = [['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['packed', 'Packed']]
export const APPROACHES = [['local', 'Local and independent'], ['mixed', 'A mix'], ['classic', 'Well-known highlights']]

export const EMPTY_PREFS = { budget: null, diet: [], cuisines: [], interests: [], pace: null, approach: null, companions: null, step_free: false }

export const hasPrefs = (p) => !!(p && (p.budget || p.diet?.length || p.cuisines?.length || p.interests?.length || p.pace || p.approach || p.companions || p.step_free))

// Compact, human summary for the "Personalised for" strip.
export function summarize(p) {
  if (!hasPrefs(p)) return []
  const label = (list, v) => list.find(([id]) => id === v)?.[1]
  return [
    p.companions && label(COMPANIONS, p.companions),
    p.budget && label(BUDGETS, p.budget),
    ...(p.diet || []),
    ...(p.cuisines || []),
    ...(p.interests || []).slice(0, 3),
    p.interests?.length > 3 && `+${p.interests.length - 3} more`,
    p.pace && `${label(PACES, p.pace)} pace`,
    p.step_free && 'Step-free access',
  ].filter(Boolean)
}
