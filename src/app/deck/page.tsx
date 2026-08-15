'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, get, post, type CardDto } from '@/lib/client/api'
import { useRoomEvents, useSession } from '@/lib/client/hooks'
import { SwipeDeck, type SwipeValue } from '@/components/SwipeDeck'
import { Nav, Notice, Screen, Spinner } from '@/components/ui'

/**
 * S5 — das Swipe-Deck, der Hauptbildschirm.
 *
 * Karten werden im Voraus geladen (PRD 10: keine sichtbare Ladezeit zwischen
 * Karten, offline-fähig für mindestens 50 Karten). Deshalb hält diese Seite
 * einen Puffer und lädt nach, lange bevor er leer ist.
 */
export default function DeckPage() {
  const router = useRouter()
  const { session, loading, reload } = useSession()
  const [cards, setCards] = useState<CardDto[]>([])
  const [vetos, setVetos] = useState(5)
  const [match, setMatch] = useState<{ name: string; isSuper: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [divergenceHint, setDivergenceHint] = useState(false)
  const loadingMore = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!session?.parent) router.replace('/')
    else if (!session.parent.calibrationComplete) router.replace('/kalibrierung')
    else setVetos(session.parent.vetosRemaining)
  }, [loading, session, router])

  const loadDeck = useCallback(async () => {
    if (loadingMore.current) return
    loadingMore.current = true
    try {
      const result = await get<{ cards: CardDto[] }>('/api/deck?size=50')
      setCards((current) => {
        const known = new Set(current.map((c) => c.ref))
        return [...current, ...result.cards.filter((c) => !known.has(c.ref))]
      })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) router.replace('/kalibrierung')
    } finally {
      loadingMore.current = false
      setReady(true)
    }
  }, [router])

  useEffect(() => {
    if (session?.parent?.calibrationComplete) void loadDeck()
  }, [session?.parent?.calibrationComplete, loadDeck])

  // Divergenz-Report: erscheint genau einmal (PRD 5.3.5).
  useEffect(() => {
    if (!session?.partner?.calibrationComplete || session.couple?.divergenceReportShown) return
    get<{ triggered: boolean }>('/api/divergence')
      .then((report) => setDivergenceHint(report.triggered))
      .catch(() => {})
  }, [session?.partner?.calibrationComplete, session?.couple?.divergenceReportShown])

  useRoomEvents(
    useCallback(
      (event) => {
        if (event.type === 'veto_count' && event.parentId !== session?.parent?.id) {
          void reload()
        }
        if (event.type === 'partner_joined' || event.type === 'partner_calibrated') void reload()
        // Ein Match des Partners taucht in der Match-Ansicht auf; hier gibt es
        // bewusst keine Einblendung, die den laufenden Swipe unterbricht.
      },
      [reload, session?.parent?.id],
    ),
    Boolean(session?.parent),
  )

  async function rate(card: CardDto, value: SwipeValue, reason?: { tag: string | null; share: boolean }) {
    setError(null)
    try {
      const result = await post<{
        match: { ref: string; isSuper: boolean } | null
        vetosRemaining: number
      }>('/api/ratings', {
        ref: card.ref,
        value,
        reasonTag: reason?.tag ?? null,
        sharedReason: reason?.share ?? false,
      })
      setVetos(result.vetosRemaining)
      if (result.match) {
        setMatch({ name: card.name, isSuper: result.match.isSuper })
        setTimeout(() => setMatch(null), 4200)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? (caught.detail ?? caught.message) : 'Nicht gespeichert.')
    }
  }

  if (loading || !ready || !session?.couple) return <Spinner />

  return (
    <>
      <Screen>
        <header className="mb-5 flex items-baseline justify-between">
          <div>
            <h1 className="display-name text-2xl">Deck</h1>
            <p className="mt-1 text-xs text-ink-faint">
              {session.partner
                ? `${session.partner.displayName} hat noch ${session.partner.vetosRemaining} von 5 Vetos übrig`
                : `Warte auf den Beitritt — Code ${session.couple.inviteCode}`}
            </p>
          </div>
        </header>

        {/* Der einzige Hinweis, den es über die Ablehnungen des Partners gibt —
            und selbst der nennt keinen Namen (PRD 5.3.3). */}
        {(session.partnerSharedAssociations ?? 0) > 0 && (
          <div className="mb-5">
            <Notice>
              Bei {session.partnerSharedAssociations === 1 ? 'einem Namen' : `${session.partnerSharedAssociations} Namen`} gab
              es bei deinem Partner eine persönliche Assoziation.
            </Notice>
          </div>
        )}

        {divergenceHint && (
          <div className="mb-5">
            <Link href="/divergenz" className="block">
              <Notice>
                Eure Geschmäcker liegen weit auseinander. Wir haben aufgeschrieben, worin genau →
              </Notice>
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-5">
            <Notice tone="warn">{error}</Notice>
          </div>
        )}

        <SwipeDeck
          cards={cards}
          surname={session.couple.surname}
          vetosRemaining={vetos}
          onRate={rate}
          onNeedMore={loadDeck}
        />
      </Screen>

      {/* Match-Rückmeldung: warm, aber nicht laut. Kein Konfetti (PRD 7). */}
      {match && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-5">
          <div
            className={`rise rounded-2xl px-5 py-4 text-center shadow-lg ${
              match.isSuper ? 'bg-super-bg text-super' : 'bg-paper-raised text-ink'
            }`}
          >
            <p className="text-sm">
              {match.isSuper ? 'Ihr beide liebt ' : 'Ihr mögt beide '}
              <span className="display-name text-base">{match.name}</span>
            </p>
          </div>
        </div>
      )}

      <Nav />
    </>
  )
}
