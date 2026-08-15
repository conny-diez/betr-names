import { NextResponse } from 'next/server'
import { TUNING } from '@config/index'
import { cardDto, jsonError } from '@/server/api'
import { combineRankings, isRankingStable, rank, type EloEntry } from '@/lib/matching/elo'
import { soundScore } from '@/lib/sound'
import {
  candidateFor,
  comparisonsOf,
  eloOf,
  getCouple,
  matchesOf,
  partnerOf,
} from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

function toEntries(rows: { name_ref: string; rating: number; comparisons: number }[]): EloEntry[] {
  return rows.map((r) => ({ ref: r.name_ref, rating: r.rating, comparisons: r.comparisons }))
}

/**
 * Die Shortlist (PRD F7) inklusive Zweitname-Ventil (PRD F9).
 *
 * Am Ende sollen 3–5 Namen stehen, die beide bereits „probegewohnt" haben
 * (PRD 2, Zielbild). Die kombinierte Liste mittelt beide Elo-Werte — beide
 * Stimmen zählen gleich.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const partner = partnerOf(parent)
    const refs = matchesOf(couple.id).map((m) => m.name_ref)

    if (refs.length < TUNING.shortlist.unlockAtMatches) {
      return NextResponse.json({
        locked: true,
        have: refs.length,
        need: TUNING.shortlist.unlockAtMatches,
        entries: [],
      })
    }

    const own = toEntries(eloOf(parent.id, refs))
    const theirs = partner ? toEntries(eloOf(partner.id, refs)) : []
    const combined = combineRankings(own, theirs)

    const entries = combined
      .map((entry) => {
        const candidate = candidateFor(couple.id, entry.ref)
        if (!candidate) return null
        return {
          ...cardDto(candidate, couple),
          combined: Math.round(entry.combined),
          ownRating: Math.round(entry.ratingA),
          comparisons: entry.comparisons,
        }
      })
      .filter((e) => e !== null)

    // --- Zweitname-Ventil (PRD F9) -----------------------------------------
    // Löst aus, wenn die Spitzenreiter beider Personen über mehrere Vergleiche
    // hinweg auseinanderliegen. Der Vorschlag ist eine Aufteilung, kein
    // Kompromiss: Erstname von einem, Zweitname vom anderen.
    const ownTop = rank(own)[0]?.ref
    const partnerTop = theirs.length ? rank(theirs)[0]?.ref : undefined
    const ownComparisons = comparisonsOf(parent.id).length
    const partnerComparisons = partner ? comparisonsOf(partner.id).length : 0

    let secondNameSuggestion = null
    if (
      ownTop &&
      partnerTop &&
      ownTop !== partnerTop &&
      ownComparisons >= TUNING.shortlist.secondNameValveAfterComparisons &&
      partnerComparisons >= TUNING.shortlist.secondNameValveAfterComparisons
    ) {
      const first = candidateFor(couple.id, ownTop)
      const second = candidateFor(couple.id, partnerTop)
      if (first && second) {
        secondNameSuggestion = {
          // Klangprüfung der vollständigen Dreier-Kombination (PRD F9).
          variantA: {
            label: `${first.name} ${second.name} ${couple.surname}`,
            sound: soundScore(`${first.name} ${second.name}`, couple.surname).score,
            flags: soundScore(`${first.name} ${second.name}`, couple.surname).flags.map((f) => f.code),
          },
          variantB: {
            label: `${second.name} ${first.name} ${couple.surname}`,
            sound: soundScore(`${second.name} ${first.name}`, couple.surname).score,
            flags: soundScore(`${second.name} ${first.name}`, couple.surname).flags.map((f) => f.code),
          },
          note: 'Ihr steht bei zwei verschiedenen Namen. Ihr müsst euch nicht entscheiden — ihr könnt teilen.',
        }
      }
    }

    return NextResponse.json({
      locked: false,
      stable: isRankingStable(own),
      comparisonsDone: ownComparisons,
      comparisonsNeeded: TUNING.shortlist.stableAfterComparisons,
      entries,
      secondNameSuggestion,
    })
  } catch (error) {
    return jsonError(error)
  }
}
