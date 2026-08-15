import { NextResponse } from 'next/server'
import { TUNING } from '@config/index'
import { cardDto, jsonError } from '@/server/api'
import { candidateFor, getCouple, matchesOf, nicknameVotes } from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Die Match-Ansicht (PRD F5).
 *
 * Ausschließlich Namen, die beide mit `like` oder `love` bewertet haben.
 * Super-Matches zuerst.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const rows = matchesOf(couple.id)

    const matches = rows
      .map((row) => {
        const candidate = candidateFor(couple.id, row.name_ref)
        if (!candidate) return null
        return {
          ...cardDto(candidate, couple),
          isSuper: row.is_super === 1,
          createdAt: row.created_at,
          nicknameVotes: nicknameVotes(parent, row.name_ref),
        }
      })
      .filter((m) => m !== null)

    return NextResponse.json({
      matches,
      // Ab wann sich der Paarvergleich freischaltet (PRD F7).
      rankingUnlocked: matches.length >= TUNING.shortlist.unlockAtMatches,
      unlockAt: TUNING.shortlist.unlockAtMatches,
    })
  } catch (error) {
    return jsonError(error)
  }
}
