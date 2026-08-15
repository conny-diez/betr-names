import { STYLE_AXES, type StyleAxis, type StyleVector } from '../types'

export const NEUTRAL_VECTOR: StyleVector = {
  era: 0.5,
  softness: 0.5,
  reach: 0.5,
  frequency: 0.5,
  ambiguity: 0.5,
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

export function clampVector(v: StyleVector): StyleVector {
  return {
    era: clamp01(v.era),
    softness: clamp01(v.softness),
    reach: clamp01(v.reach),
    frequency: clamp01(v.frequency),
    ambiguity: clamp01(v.ambiguity),
  }
}

/**
 * Euklidische Distanz im Stilraum, normiert auf [0,1].
 *
 * Der Rohwert liegt bei fuenf Achsen in [0, √5]; die Empfehlungsformel aus
 * PRD 5.3.5 rechnet mit `1 - distanz` und braucht deshalb einen Wert, der
 * nicht negativ werden kann.
 */
export function styleDistance(a: StyleVector, b: StyleVector): number {
  const sum = STYLE_AXES.reduce((acc, axis) => acc + (a[axis] - b[axis]) ** 2, 0)
  return Math.sqrt(sum) / Math.sqrt(STYLE_AXES.length)
}

/**
 * Gewichtete Distanz: Achsen mit niedriger Confidence zaehlen schwaecher
 * (PRD 5.2.2 — "Achsen mit niedriger Confidence werden im Matching schwächer
 * gewichtet").
 */
export function weightedStyleDistance(
  a: StyleVector,
  b: StyleVector,
  weights: Partial<Record<StyleAxis, number>>,
): number {
  let sum = 0
  let total = 0
  for (const axis of STYLE_AXES) {
    const w = weights[axis] ?? 1
    sum += w * (a[axis] - b[axis]) ** 2
    total += w
  }
  if (total === 0) return styleDistance(a, b)
  return Math.sqrt(sum / total)
}

export function midpoint(a: StyleVector, b: StyleVector): StyleVector {
  return {
    era: (a.era + b.era) / 2,
    softness: (a.softness + b.softness) / 2,
    reach: (a.reach + b.reach) / 2,
    frequency: (a.frequency + b.frequency) / 2,
    ambiguity: (a.ambiguity + b.ambiguity) / 2,
  }
}

export function meanVector(vectors: StyleVector[]): StyleVector {
  if (!vectors.length) return { ...NEUTRAL_VECTOR }
  const acc: StyleVector = { era: 0, softness: 0, reach: 0, frequency: 0, ambiguity: 0 }
  for (const v of vectors) for (const axis of STYLE_AXES) acc[axis] += v[axis]
  for (const axis of STYLE_AXES) acc[axis] /= vectors.length
  return acc
}

/** Standardabweichung pro Achse — Basis der Confidence in PRD 5.2.2. */
export function stdDevPerAxis(vectors: StyleVector[]): Record<StyleAxis, number> {
  const mean = meanVector(vectors)
  const out = {} as Record<StyleAxis, number>
  for (const axis of STYLE_AXES) {
    if (vectors.length < 2) {
      out[axis] = 0.5
      continue
    }
    const variance =
      vectors.reduce((acc, v) => acc + (v[axis] - mean[axis]) ** 2, 0) / vectors.length
    out[axis] = Math.sqrt(variance)
  }
  return out
}
