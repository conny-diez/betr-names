import { NextResponse } from 'next/server'
import { jsonError } from '@/server/api'
import { nicknameVotes, voteNickname } from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Spitznamen-Abstimmung (PRD F6).
 *
 * "Man wählt Maximilian und ruft 18 Jahre lang Max." Beide stimmen pro
 * Spitzname getrennt ab; das Ergebnis des Partners wird erst sichtbar, wenn
 * man selbst gestimmt hat — dieselbe Blind-zuerst-Regel wie beim Deck.
 */
export async function POST(request: Request) {
  try {
    const parent = await requireParent()
    const body = await request.json()
    const ref = String(body.ref ?? '')
    const nickname = String(body.nickname ?? '')
    if (!ref || !nickname) throw new Error('Unvollständige Abstimmung.')

    voteNickname(parent.id, ref, nickname, body.approves === true)

    const votes = nicknameVotes(parent, ref)
    const visible = Object.fromEntries(
      Object.entries(votes).map(([name, vote]) => [
        name,
        { own: vote.own, partner: vote.own === null ? null : vote.partner },
      ]),
    )
    return NextResponse.json({ votes: visible })
  } catch (error) {
    return jsonError(error)
  }
}
