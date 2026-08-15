import { NextResponse } from 'next/server'
import { TUNING } from '@config/index'
import { cardDto, jsonError } from '@/server/api'
import {
  applyComparison,
  isRankingStable,
  nextPair,
  pairKey,
  rank,
  type EloEntry,
} from '@/lib/matching/elo'

import {
  candidateFor,
  comparisonsOf,
  eloOf,
  getCouple,
  matchesOf,
  recordComparison,
  saveElo,
} from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

function toEntries(rows: { name_ref: string; rating: number; comparisons: number }[]): EloEntry[] {
  return rows.map((r) => ({ ref: r.name_ref, rating: r.rating, comparisons: r.comparisons }))
}

/**
 * Nächstes Vergleichspaar (PRD F7).
 *
 * Kein Sternesystem — Sterne landen erfahrungsgemäß alle bei vier. Der
 * Paarvergleich erzwingt eine Entscheidung, das Elo-Rating macht daraus eine
 * Rangfolge.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const matches = matchesOf(couple.id)

    if (matches.length < TUNING.shortlist.unlockAtMatches) {
      return NextResponse.json({
        locked: true,
        have: matches.length,
        need: TUNING.shortlist.unlockAtMatches,
        pair: null,
      })
    }

    const refs = matches.map((m) => m.name_ref)
    const entries = toEntries(eloOf(parent.id, refs))
    const seen = new Set(comparisonsOf(parent.id).map((c) => pairKey(c.name_a, c.name_b)))
    const pair = nextPair(entries, seen)

    return NextResponse.json({
      locked: false,
      stable: isRankingStable(entries),
      comparisonsNeeded: TUNING.shortlist.stableAfterComparisons,
      comparisonsDone: comparisonsOf(parent.id).length,
      pair: pair
        ? pair.map((entry) => {
            const candidate = candidateFor(couple.id, entry.ref)
            return candidate ? cardDto(candidate, couple) : null
          })
        : null,
    })
  } catch (error) {
    return jsonError(error)
  }
}

/** Ergebnis eines Vergleichs. Beide antworten unabhängig (PRD F7). */
export async function POST(request: Request) {
  try {
    const parent = await requireParent()
    const body = await request.json()
    const winnerRef = String(body.winner ?? '')
    const loserRef = String(body.loser ?? '')
    if (!winnerRef || !loserRef || winnerRef === loserRef) throw new Error('Ungültiger Vergleich.')

    const [winner, loser] = toEntries(eloOf(parent.id, [winnerRef, loserRef]))
    const updated = applyComparison(winner, loser)

    saveElo([
      { parent_id: parent.id, name_ref: winnerRef, rating: updated.winner.rating, comparisons: updated.winner.comparisons },
      { parent_id: parent.id, name_ref: loserRef, rating: updated.loser.rating, comparisons: updated.loser.comparisons },
    ])
    recordComparison(parent.id, winnerRef, loserRef, winnerRef)

    const refs = matchesOf(parent.couple_id).map((m) => m.name_ref)
    const ranked = rank(toEntries(eloOf(parent.id, refs)))
    return NextResponse.json({ top: ranked[0]?.ref ?? null })
  } catch (error) {
    return jsonError(error)
  }
}
