import { STYLE_AXES, type StyleAxis } from '../types'
import { confidentAxes, type StyleProfile } from './calibration'

export const AXIS_LABEL: Record<StyleAxis, string> = {
  era: 'Zeit',
  softness: 'Klangfarbe',
  reach: 'Reichweite',
  frequency: 'Häufigkeit',
  ambiguity: 'Zuordnung',
}

export const AXIS_POLES: Record<StyleAxis, { low: string; high: string }> = {
  era: { low: 'klassisch', high: 'modern' },
  softness: { low: 'hart', high: 'weich' },
  reach: { low: 'deutsch verankert', high: 'international' },
  frequency: { low: 'häufig', high: 'selten' },
  ambiguity: { low: 'eindeutig', high: 'neutral' },
}

/** Adjektive fuer den Klartext-Satz. Bewusst warm, nie wertend. */
const PHRASES: Record<StyleAxis, { low: string; high: string }> = {
  era: { low: 'Namen mit Tradition', high: 'moderne Namen' },
  softness: { low: 'konsonantische, feste Namen', high: 'weiche, vokalische Namen' },
  reach: { low: 'im Deutschen verwurzelte Namen', high: 'international tragfähige Namen' },
  frequency: { low: 'vertraute Namen', high: 'seltene Namen' },
  ambiguity: { low: 'klar zugeordnete Namen', high: 'geschlechtsoffene Namen' },
}

const NEUTRAL_LOW = 0.4
const NEUTRAL_HIGH = 0.6

export interface ProfileStatement {
  axis: StyleAxis
  /** -1 = zum unteren Pol, 1 = zum oberen Pol */
  direction: -1 | 1
  phrase: string
  strength: number
}

/** Achsen mit klarer Tendenz und ausreichender Confidence (PRD 5.2.2). */
export function profileStatements(profile: StyleProfile): ProfileStatement[] {
  const shown = new Set(confidentAxes(profile))
  return STYLE_AXES.filter((axis) => shown.has(axis))
    .map((axis) => {
      const value = profile.vector[axis]
      if (value >= NEUTRAL_LOW && value <= NEUTRAL_HIGH) return null
      const direction: -1 | 1 = value < NEUTRAL_LOW ? -1 : 1
      return {
        axis,
        direction,
        phrase: direction === -1 ? PHRASES[axis].low : PHRASES[axis].high,
        strength: Math.abs(value - 0.5) * 2,
      }
    })
    .filter((s): s is ProfileStatement => s !== null)
    .sort((a, b) => b.strength - a.strength)
}

/**
 * Klartext-Zusammenfassung des Profils (PRD 5.2.2 / F2).
 *
 * Dieser Satz ist der erste Payoff des Produkts. Er behauptet nur, was die
 * Daten hergeben: Achsen mit niedriger Confidence tauchen nicht auf, und wenn
 * gar nichts trennscharf ist, sagt der Satz genau das.
 */
export function profileSummary(profile: StyleProfile): string {
  const statements = profileStatements(profile)
  if (!statements.length) {
    return 'Dein Geschmack ist breiter als der Durchschnitt — du hast dich auf keiner Achse klar festgelegt. Das ist kein Mangel, es macht dich beim Suchen nur beweglicher.'
  }
  const top = statements.slice(0, 3).map((s) => s.phrase)
  const joined =
    top.length === 1
      ? top[0]
      : `${top.slice(0, -1).join(', ')} und ${top[top.length - 1]}`
  return `Du magst ${joined}.`
}

/** Kurzform fuer die Kopfzeile im Profil-Screen. */
export function profileHeadline(profile: StyleProfile): string {
  const statements = profileStatements(profile)
  if (!statements.length) return 'Offen in alle Richtungen'
  const [first] = statements
  const poles = AXIS_POLES[first.axis]
  return first.direction === -1 ? capitalize(poles.low) : capitalize(poles.high)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
