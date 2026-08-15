import { STYLE_AXES, type RatingValue, type StyleAxis, type StyleVector } from '../types'
import { TUNING } from '../../../config'
import { NEUTRAL_VECTOR, clamp01, meanVector, stdDevPerAxis } from './vector'

export interface StyleProfile {
  vector: StyleVector
  confidence: Record<StyleAxis, number>
  /** Zahl der beruecksichtigten Bewertungen — fuer "Profil noch dünn"-Hinweise */
  sampleSize: number
}

export interface WeightedRating {
  vector: StyleVector
  value: RatingValue
  /** aeltere Bewertungen zuerst; bestimmt die Gewichtung des gleitenden Profils */
  index?: number
}

export const EMPTY_PROFILE: StyleProfile = {
  vector: { ...NEUTRAL_VECTOR },
  confidence: { era: 0, softness: 0, reach: 0, frequency: 0, ambiguity: 0 },
  sampleSize: 0,
}

function isYes(value: RatingValue): boolean {
  return value === 'love' || value === 'like'
}

/**
 * Stilprofil aus Bewertungen (PRD 5.2.2).
 *
 *   profil[achse] = mean(ja_namen[achse]) - 0.5 * (mean(nein_namen[achse]) - 0.5)
 *
 * geklemmt auf [0,1]. Der Faktor 0.5 steht in `config/tuning.json`
 * (`calibration.rejectionWeight`).
 *
 * Fortlaufende Aktualisierung: die juengsten `recentWindow` Bewertungen zaehlen
 * mit `recentWeight` (PRD 5.2.2, letzter Absatz).
 */
export function computeProfile(ratings: WeightedRating[]): StyleProfile {
  if (!ratings.length) return { ...EMPTY_PROFILE, confidence: { ...EMPTY_PROFILE.confidence } }

  const cutoff = Math.max(0, ratings.length - TUNING.calibration.recentWindow)
  const weightOf = (i: number) => (i >= cutoff ? TUNING.calibration.recentWeight : 1)

  const yes: { v: StyleVector; w: number }[] = []
  const no: { v: StyleVector; w: number }[] = []
  ratings.forEach((r, i) => {
    const entry = { v: r.vector, w: weightOf(i) }
    if (isYes(r.value)) yes.push(entry)
    else no.push(entry)
  })

  const vector = {} as StyleVector
  for (const axis of STYLE_AXES) {
    const yesMean = weightedMean(yes, axis)
    const noMean = weightedMean(no, axis)
    const base = yesMean ?? 0.5
    const correction =
      noMean === null ? 0 : TUNING.calibration.rejectionWeight * (noMean - 0.5)
    vector[axis] = clamp01(base - correction)
  }

  return {
    vector,
    confidence: computeConfidence(yes.map((y) => y.v)),
    sampleSize: ratings.length,
  }
}

function weightedMean(entries: { v: StyleVector; w: number }[], axis: StyleAxis): number | null {
  if (!entries.length) return null
  const totalWeight = entries.reduce((acc, e) => acc + e.w, 0)
  if (totalWeight === 0) return null
  return entries.reduce((acc, e) => acc + e.v[axis] * e.w, 0) / totalWeight
}

/**
 * Confidence pro Achse, invers zur Streuung der Ja-Namen (PRD 5.2.2).
 *
 * Eine hohe Streuung heisst: die Achse trennt bei dieser Person nichts — sie
 * mag dort offenbar beides. Solche Achsen werden im Matching schwaecher
 * gewichtet und im Profil-Screen gar nicht erst behauptet.
 */
export function computeConfidence(yesVectors: StyleVector[]): Record<StyleAxis, number> {
  const out = {} as Record<StyleAxis, number>
  if (yesVectors.length < 2) {
    for (const axis of STYLE_AXES) out[axis] = 0
    return out
  }
  const spread = stdDevPerAxis(yesVectors)
  for (const axis of STYLE_AXES) {
    out[axis] = clamp01(1 - spread[axis] / TUNING.calibration.confidenceSpreadCap)
  }
  return out
}

/** Achsen, die dem Nutzer als Ergebnis gezeigt werden duerfen (PRD 5.2.2). */
export function confidentAxes(profile: StyleProfile): StyleAxis[] {
  return STYLE_AXES.filter(
    (axis) => profile.confidence[axis] >= TUNING.calibration.lowConfidenceThreshold,
  )
}

export { meanVector }
