import { TUNING } from '../../../config'
import { soundScore } from '../sound'
import { styleDistance, weightedStyleDistance } from '../style/vector'
import type { NameCandidate, StyleAxis, StyleVector } from '../types'

export interface RecommendationContext {
  /** (profil_a + profil_b) / 2 — PRD 5.3.5 */
  targetVector: StyleVector
  surname: string
  /** Refs, die einer der beiden schon gesehen hat */
  seenRefs: ReadonlySet<string>
  /** Stilvektoren der Namen, die **beide** abgelehnt haben — Basis von `penalty` */
  bothRejectedVectors: readonly StyleVector[]
  siblingNames?: string[]
  /**
   * Gewicht je Achse, abgeleitet aus der Confidence beider Profile.
   *
   * PRD 5.2.2: "Achsen mit niedriger Confidence werden im Matching schwächer
   * gewichtet." Ohne das schlägt vor allem `ambiguity` durch: über neunzig
   * Prozent des Korpus liegen dort bei 0, ein Profil mit 0.5 macht damit den
   * halben Korpus künstlich "weit weg" und das Deck zeigt fast nur noch
   * geschlechtsoffene Namen.
   */
  axisWeights?: Partial<Record<StyleAxis, number>>
}

export interface ScoredCandidate {
  candidate: NameCandidate
  score: number
  distance: number
  novelty: number
  penalty: number
  soundScore: number
}

/**
 * `novelty` = 1, wenn der Name von keinem Elternteil gesehen wurde, sonst 0
 * (PRD 5.3.5).
 */
export function novelty(ref: string, seenRefs: ReadonlySet<string>): number {
  return seenRefs.has(ref) ? 0 : 1
}

/**
 * `penalty` steigt mit der Aehnlichkeit zu Namen, die beide bereits abgelehnt
 * haben: Distanz < 0.15 zu mindestens zwei Ablehnungen (PRD 5.3.5).
 */
export function rejectionPenalty(
  vector: StyleVector,
  bothRejectedVectors: readonly StyleVector[],
): number {
  const cfg = TUNING.recommendation.penalty
  const neighbours = bothRejectedVectors.filter(
    (v) => styleDistance(vector, v) < cfg.neighbourDistance,
  ).length
  if (neighbours < cfg.minRejections) return 0
  return Math.min(cfg.max, (neighbours - cfg.minRejections + 1) * cfg.perNeighbour)
}

/**
 * Empfehlungsscore aus PRD 5.3.5.
 *
 *   score = w1 * (1 - dist) + w2 * (klang/100) + w3 * novelty - w4 * penalty
 *
 * Gewichte kommen aus `config/tuning.json` (PRD 14.2).
 */
export function scoreCandidate(
  candidate: NameCandidate,
  ctx: RecommendationContext,
): ScoredCandidate {
  const w = TUNING.recommendation
  const distance = ctx.axisWeights
    ? weightedStyleDistance(candidate.style_vector, ctx.targetVector, ctx.axisWeights)
    : styleDistance(candidate.style_vector, ctx.targetVector)
  const sound = soundScore(candidate.name, ctx.surname, {
    siblingNames: ctx.siblingNames,
    styleVector: candidate.style_vector,
  }).score
  const nov = novelty(candidate.ref, ctx.seenRefs)
  const pen = rejectionPenalty(candidate.style_vector, ctx.bothRejectedVectors)

  const score =
    w.w1_styleDistance * (1 - distance) +
    w.w2_soundScore * (sound / 100) +
    w.w3_novelty * nov -
    w.w4_penalty * pen

  return { candidate, score, distance, novelty: nov, penalty: pen, soundScore: sound }
}

export function scoreAll(
  candidates: readonly NameCandidate[],
  ctx: RecommendationContext,
): ScoredCandidate[] {
  return candidates.map((c) => scoreCandidate(c, ctx)).sort((a, b) => b.score - a.score)
}
