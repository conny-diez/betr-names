import { NextResponse } from 'next/server'
import { cardDto, jsonError, soundDto } from '@/server/api'
import { soundScore } from '@/lib/sound'
import { addCustomName, getCouple, ownCustomCandidates, ratingFor } from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Die eigene Liste (PRD F4).
 *
 * Zeigt nur die selbst hinzugefügten Namen. Die des Partners bleiben hier
 * unsichtbar und tauchen ausschließlich unmarkiert im Deck auf: wer weiß, dass
 * ein Name vom anderen kommt, bewertet nicht mehr den Namen, sondern die
 * Beziehung.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const mine = ownCustomCandidates(parent)
    return NextResponse.json({
      names: mine.map((c) => ({
        ...cardDto(c, couple),
        ownRating: ratingFor(parent.id, c.ref)?.value ?? null,
      })),
    })
  } catch (error) {
    return jsonError(error)
  }
}

/** Namen hinzufügen (PRD F4). Der Klang-Score kommt direkt mit zurück. */
export async function POST(request: Request) {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const body = await request.json()
    const custom = addCustomName(parent, String(body.name ?? ''), body.gender ?? 'neutral')
    return NextResponse.json({
      ref: `custom:${custom.id}`,
      name: custom.name,
      sound: soundDto(
        soundScore(custom.name, couple.surname, {
          siblingNames: couple.siblingNames,
          styleVector: custom.style_vector,
        }),
      ),
    })
  } catch (error) {
    return jsonError(error)
  }
}
