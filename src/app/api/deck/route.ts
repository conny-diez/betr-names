import { NextResponse } from 'next/server'
import { TUNING } from '@config/index'
import { cardDto, deckFor, jsonError } from '@/server/api'
import { roomState } from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Der nächste Deck-Stapel (PRD F3).
 *
 * Der Client lädt vor und hält mindestens `preloadCards` Karten lokal, damit
 * zwischen zwei Karten keine Ladezeit entsteht (PRD 10, Performance).
 */
export async function GET(request: Request) {
  try {
    const parent = await requireParent()
    const url = new URL(request.url)
    const size = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('size') ?? TUNING.deck.preloadCards)),
    )

    const state = roomState(parent)
    if (parent.calibration_complete !== 1) {
      return NextResponse.json(
        { error: 'Erst kalibrieren.', cards: [], needsCalibration: true },
        { status: 409 },
      )
    }

    const cards = deckFor(state, size)
    return NextResponse.json({
      cards: cards.map((card) => ({
        ...cardDto(card.candidate, state.couple),
        // Die Quelle ist für die Person selbst sichtbar (eine Entdeckung darf
        // sich als Entdeckung zeigen), verrät aber nichts über den Partner.
        source: card.source,
      })),
      exhausted: cards.length === 0,
    })
  } catch (error) {
    return jsonError(error)
  }
}
