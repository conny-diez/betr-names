import { NextResponse } from 'next/server'
import { cardDto, jsonError } from '@/server/api'
import { combineRankings, type EloEntry } from '@/lib/matching/elo'
import {
  candidateFor,
  currentTrial,
  eloOf,
  getCouple,
  matchesOf,
  partnerOf,
  setTrialVerdict,
  startTrial,
  trialHistory,
} from '@/server/repo'
import { requireParent } from '@/server/session'
import type { TrialVerdict } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VERDICTS: TrialVerdict[] = ['better', 'same', 'worse']

function toEntries(rows: { name_ref: string; rating: number; comparisons: number }[]): EloEntry[] {
  return rows.map((r) => ({ ref: r.name_ref, rating: r.rating, comparisons: r.comparisons }))
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
}

/**
 * Probewohnen (PRD F8).
 *
 * Ein Name wird zum „Namen der Woche". Die App verwendet ihn danach beiläufig
 * in Texten — nichts entlarvt einen Namen so schnell wie sieben Tage mit ihm.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const trial = currentTrial(couple.id)

    // Vorschläge: Top 3 der kombinierten Shortlist.
    const refs = matchesOf(couple.id).map((m) => m.name_ref)
    const partner = partnerOf(parent)
    const combined = combineRankings(
      toEntries(eloOf(parent.id, refs)),
      partner ? toEntries(eloOf(partner.id, refs)) : [],
    ).slice(0, 3)

    const suggestions = combined
      .map((c) => {
        const candidate = candidateFor(couple.id, c.ref)
        return candidate ? cardDto(candidate, couple) : null
      })
      .filter((c) => c !== null)

    if (!trial) {
      return NextResponse.json({ trial: null, suggestions, history: [] })
    }

    const candidate = candidateFor(couple.id, trial.name_ref)
    const days = daysSince(trial.start_date)
    const ownVerdict = parent.slot === 0 ? trial.verdict_a : trial.verdict_b
    const partnerVerdict = parent.slot === 0 ? trial.verdict_b : trial.verdict_a

    return NextResponse.json({
      trial: candidate
        ? {
            ...cardDto(candidate, couple),
            startDate: trial.start_date,
            days,
            // Erst am Wochenende bewerten (PRD F8).
            verdictDue: days >= 6,
            ownVerdict,
            // Ob der Partner schon abgestimmt hat, ist sichtbar — was er
            // gestimmt hat, erst wenn beide gestimmt haben.
            partnerHasVoted: partnerVerdict !== null,
            partnerVerdict: ownVerdict && partnerVerdict ? partnerVerdict : null,
            dueDate: couple.dueDate,
            daysUntilDue: couple.dueDate
              ? Math.max(0, Math.ceil((new Date(couple.dueDate).getTime() - Date.now()) / 86_400_000))
              : null,
          }
        : null,
      suggestions,
      history: trialHistory(couple.id).slice(1),
    })
  } catch (error) {
    return jsonError(error)
  }
}

/** Namen der Woche setzen. */
export async function PUT(request: Request) {
  try {
    const parent = await requireParent()
    const body = await request.json()
    const ref = String(body.ref ?? '')
    if (!candidateFor(parent.couple_id, ref)) throw new Error('Diesen Namen gibt es nicht.')
    startTrial(parent.couple_id, ref)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}

/** Wochenurteil abgeben: besser geworden / gleich / schlechter geworden. */
export async function POST(request: Request) {
  try {
    const parent = await requireParent()
    const body = await request.json()
    const verdict = String(body.verdict) as TrialVerdict
    if (!VERDICTS.includes(verdict)) throw new Error('Unbekanntes Urteil.')
    const trial = setTrialVerdict(parent.couple_id, parent.slot, verdict)
    return NextResponse.json({ ok: trial !== null })
  } catch (error) {
    return jsonError(error)
  }
}
