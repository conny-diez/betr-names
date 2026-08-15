import { TUNING } from '../../../config'
import { STYLE_AXES, type StyleAxis } from '../types'
import type { StyleProfile } from '../style/calibration'
import { AXIS_POLES } from '../style/profile'
import { styleDistance } from '../style/vector'

export interface DivergenceLine {
  axis: StyleAxis
  gap: number
  /** Klartext, neutral, ohne Wertung */
  text: string
}

export interface DivergenceReport {
  distance: number
  /** true, sobald die Profil-Distanz den Schwellwert ueberschreitet */
  triggered: boolean
  lines: DivergenceLine[]
  intro: string
}

const AXIS_SENTENCE: Record<StyleAxis, { low: string; high: string }> = {
  era: { low: 'Namen mit Tradition', high: 'moderne Namen' },
  softness: { low: 'harte, konsonantische Namen', high: 'weiche, vokalische Namen' },
  reach: { low: 'im Deutschen verwurzelte Namen', high: 'international klingende Namen' },
  frequency: { low: 'vertraute Namen', high: 'seltene Namen' },
  ambiguity: { low: 'klar zugeordnete Namen', high: 'geschlechtsoffene Namen' },
}

/**
 * Divergenz-Report (PRD 5.3.5).
 *
 * Bewusst ohne Kompatibilitaets-Prozentzahl (PRD 7, UI-Grundregeln) und ohne
 * Wertung. Der Report benennt Muster, keine Schuld: "wir haben unterschiedliche
 * Muster" statt "ich mag deinen Namen nicht".
 */
export function divergenceReport(
  a: StyleProfile,
  b: StyleProfile,
  /**
   * Anrede für beide Seiten. `b` steht mitten im Satz und muss deshalb schon
   * satzfertig übergeben werden — ein Name wird kleingeschrieben zu „ben",
   * eine Umschreibung großgeschrieben zu „Dein Partner magst".
   */
  labels: { a: string; b: string } = { a: 'Du', b: 'dein Partner' },
): DivergenceReport {
  const distance = styleDistance(a.vector, b.vector)
  const triggered = distance > TUNING.divergence.reportProfileDistance

  const lines = STYLE_AXES.map((axis) => {
    const gap = a.vector[axis] - b.vector[axis]
    if (Math.abs(gap) < 0.2) return null
    // Nur Achsen zeigen, auf die sich beide auch verlassen koennen.
    if (
      a.confidence[axis] < TUNING.calibration.lowConfidenceThreshold ||
      b.confidence[axis] < TUNING.calibration.lowConfidenceThreshold
    ) {
      return null
    }
    const aSide = gap > 0 ? AXIS_SENTENCE[axis].high : AXIS_SENTENCE[axis].low
    const bSide = gap > 0 ? AXIS_SENTENCE[axis].low : AXIS_SENTENCE[axis].high
    return {
      axis,
      gap: Math.abs(gap),
      text: `${labels.a} magst ${aSide}, ${labels.b} ${bSide}.`,
    }
  })
    .filter((l): l is DivergenceLine => l !== null)
    .sort((x, y) => y.gap - x.gap)

  return {
    distance,
    triggered,
    lines,
    intro:
      'Ihr sucht nicht denselben Namen — ihr sucht nach unterschiedlichen Mustern. Das ist keine schlechte Nachricht, es erklärt nur, warum die Vorschläge des jeweils anderen manchmal so danebenliegen.',
  }
}

export function axisPoleLabel(axis: StyleAxis, value: number): string {
  return value < 0.5 ? AXIS_POLES[axis].low : AXIS_POLES[axis].high
}
