import { NextResponse } from 'next/server'
import { cardDto, jsonError } from '@/server/api'
import { candidateFor, getCouple, rate, ratingFor, ratingsOf, getParent } from '@/server/repo'
import { requireParent } from '@/server/session'
import { REASON_TAGS, SHAREABLE_REASON, type RatingValue } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALUES: RatingValue[] = ['love', 'like', 'pass', 'veto']

/**
 * Die **eigenen** Vetos (PRD S13, „Vetos verwalten").
 *
 * Ausschließlich die eigenen. Es gibt keinen Parameter, keine Rolle und keinen
 * Umweg, über den sich die Vetos des Partners abrufen ließen — das ist
 * Kernprinzip 1 und deshalb keine Berechtigungsfrage, sondern eine Frage
 * dessen, was die Route überhaupt kann.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const vetoed = ratingsOf(parent.id)
      .filter((r) => r.value === 'veto')
      .map((r) => {
        const candidate = candidateFor(couple.id, r.name_ref)
        return candidate ? { ...cardDto(candidate, couple), reasonTag: r.reason_tag } : null
      })
      .filter((v) => v !== null)

    return NextResponse.json({ vetos: vetoed, remaining: parent.vetos_remaining })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * Eine Bewertung abgeben (PRD 5.3.1).
 *
 * Die Antwort enthält ein Match nur dann, wenn beide `like` oder `love`
 * vergeben haben. Bei allem anderen erfährt der Client nichts über den
 * Partner — auch nicht implizit über eine Statusänderung.
 */
export async function POST(request: Request) {
  try {
    const parent = await requireParent()
    const body = await request.json()
    const value = String(body.value) as RatingValue
    if (!VALUES.includes(value)) throw new Error('Unbekannte Bewertung.')

    const reasonTag =
      typeof body.reasonTag === 'string' && REASON_TAGS.includes(body.reasonTag as never)
        ? body.reasonTag
        : null

    // Geteilt werden darf ausschließlich „erinnert mich an jemanden", und auch
    // das nur mit aktiver Zustimmung (PRD 5.3.3).
    const sharedReason = body.sharedReason === true && reasonTag === SHAREABLE_REASON

    const result = rate(parent, String(body.ref), value, { reasonTag, sharedReason })
    return NextResponse.json({
      match: result.match,
      vetosRemaining: result.vetosRemaining,
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * Ein Veto zurücknehmen (PRD 5.3.2: "Ein Veto kann jederzeit zurückgenommen
 * werden — dann ist es wieder verfügbar").
 */
export async function DELETE(request: Request) {
  try {
    const parent = await requireParent()
    const url = new URL(request.url)
    const ref = url.searchParams.get('ref')
    if (!ref) throw new Error('Kein Name angegeben.')

    const existing = ratingFor(parent.id, ref)
    if (!existing) return NextResponse.json({ vetosRemaining: parent.vetos_remaining })

    // Zurück auf `pass`: der Name ist nicht mehr blockiert, aber auch nicht
    // plötzlich wieder im Deck. Wer ein Veto zurücknimmt, will es überdenken,
    // nicht die Karte erneut sehen.
    const result = rate(parent, ref, 'pass')
    return NextResponse.json({
      vetosRemaining: result.vetosRemaining,
      parent: getParent(parent.id).vetos_remaining,
    })
  } catch (error) {
    return jsonError(error)
  }
}
