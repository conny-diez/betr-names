import { TUNING } from '../../../config'

export interface EloEntry {
  ref: string
  rating: number
  comparisons: number
}

export const ELO_START = TUNING.shortlist.eloStart
export const ELO_K = TUNING.shortlist.eloK

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400))
}

/**
 * Elo-Update nach einem Paarvergleich (PRD F7, K-Faktor 32, Start 1500).
 *
 * Bewusst kein Sternesystem: Sterne landen erfahrungsgemaess alle bei vier,
 * ein Paarvergleich erzwingt eine echte Entscheidung.
 */
export function applyComparison(
  winner: EloEntry,
  loser: EloEntry,
): { winner: EloEntry; loser: EloEntry } {
  const expectedWinner = expectedScore(winner.rating, loser.rating)
  const expectedLoser = expectedScore(loser.rating, winner.rating)
  return {
    winner: {
      ...winner,
      rating: winner.rating + ELO_K * (1 - expectedWinner),
      comparisons: winner.comparisons + 1,
    },
    loser: {
      ...loser,
      rating: loser.rating + ELO_K * (0 - expectedLoser),
      comparisons: loser.comparisons + 1,
    },
  }
}

/**
 * Naechstes Vergleichspaar: moeglichst aehnlich bewertet (dort steckt die
 * meiste Information) und moeglichst selten verglichen.
 */
export function nextPair(
  entries: readonly EloEntry[],
  seenPairs: ReadonlySet<string>,
): [EloEntry, EloEntry] | null {
  if (entries.length < 2) return null
  const candidates: { pair: [EloEntry, EloEntry]; cost: number }[] = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const key = pairKey(entries[i].ref, entries[j].ref)
      if (seenPairs.has(key)) continue
      const ratingGap = Math.abs(entries[i].rating - entries[j].rating)
      const usage = entries[i].comparisons + entries[j].comparisons
      candidates.push({ pair: [entries[i], entries[j]], cost: ratingGap / 400 + usage })
    }
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => a.cost - b.cost)
  return candidates[0].pair
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Ranking einer Person: hoechstes Elo zuerst. */
export function rank(entries: readonly EloEntry[]): EloEntry[] {
  return [...entries].sort((a, b) => b.rating - a.rating || a.ref.localeCompare(b.ref))
}

export interface CombinedEntry {
  ref: string
  combined: number
  ratingA: number
  ratingB: number
  comparisons: number
}

/**
 * Kombinierte Shortlist (PRD F7).
 *
 * Mittelwert beider Elo-Werte. Bewusst kein Maximum und keine Gewichtung nach
 * "wer hat mehr verglichen": beide Stimmen zaehlen gleich, sonst gewinnt, wer
 * mehr Zeit in der App verbracht hat.
 */
export function combineRankings(
  a: readonly EloEntry[],
  b: readonly EloEntry[],
): CombinedEntry[] {
  const byRef = new Map<string, { a?: EloEntry; b?: EloEntry }>()
  for (const e of a) byRef.set(e.ref, { ...(byRef.get(e.ref) ?? {}), a: e })
  for (const e of b) byRef.set(e.ref, { ...(byRef.get(e.ref) ?? {}), b: e })

  return [...byRef.entries()]
    .map(([ref, pair]) => {
      const ratingA = pair.a?.rating ?? ELO_START
      const ratingB = pair.b?.rating ?? ELO_START
      return {
        ref,
        ratingA,
        ratingB,
        combined: (ratingA + ratingB) / 2,
        comparisons: (pair.a?.comparisons ?? 0) + (pair.b?.comparisons ?? 0),
      }
    })
    .sort((x, y) => y.combined - x.combined || x.ref.localeCompare(y.ref))
}

/** Ab wann ist das Ranking stabil genug zum Anzeigen? (PRD F7: ca. 12 Vergleiche) */
export function isRankingStable(entries: readonly EloEntry[]): boolean {
  const total = entries.reduce((acc, e) => acc + e.comparisons, 0) / 2
  return total >= TUNING.shortlist.stableAfterComparisons
}

/**
 * Zweitname-Ventil (PRD F9).
 *
 * Loest aus, wenn die Top-1-Namen beider Personen ueber mindestens
 * `secondNameValveAfterComparisons` Vergleiche hinweg unterschiedlich bleiben.
 * `history` enthaelt je Vergleichsrunde die beiden Spitzenreiter.
 */
export function secondNameValveTriggered(
  history: readonly { topA: string; topB: string }[],
): boolean {
  const n = TUNING.shortlist.secondNameValveAfterComparisons
  if (history.length < n) return false
  return history.slice(-n).every((h) => h.topA !== h.topB)
}
