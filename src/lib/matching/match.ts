import type { RatingValue } from '../types'

export interface MatchVerdict {
  isMatch: boolean
  isSuper: boolean
}

const YES: RatingValue[] = ['love', 'like']

/**
 * Match-Logik (PRD 5.3.4).
 *
 * Ein Match entsteht, sobald beide denselben Namen mit `like` oder `love`
 * bewertet haben. Zwei `love` ergeben ein Super-Match.
 */
export function evaluateMatch(a: RatingValue | undefined, b: RatingValue | undefined): MatchVerdict {
  if (!a || !b) return { isMatch: false, isSuper: false }
  const isMatch = YES.includes(a) && YES.includes(b)
  return { isMatch, isSuper: isMatch && a === 'love' && b === 'love' }
}

/**
 * Was der Partner ueber eine Bewertung erfahren darf (PRD 4.1, 5.3.1).
 *
 * `pass` und `veto` sind fuer den Partner niemals namentlich sichtbar. Diese
 * Funktion ist die einzige Stelle, die darueber entscheidet — damit es genau
 * eine Stelle gibt, die man pruefen muss.
 */
export function isVisibleToPartner(own: RatingValue, partner: RatingValue | undefined): boolean {
  return YES.includes(own) && partner !== undefined && YES.includes(partner)
}

export function isYes(value: RatingValue): boolean {
  return YES.includes(value)
}

export function isRejection(value: RatingValue): boolean {
  return value === 'pass' || value === 'veto'
}
