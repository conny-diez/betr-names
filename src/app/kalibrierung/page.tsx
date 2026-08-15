'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { get, post, type CardDto } from '@/lib/client/api'
import { useSession } from '@/lib/client/hooks'
import { SwipeDeck, type SwipeValue } from '@/components/SwipeDeck'
import { Screen, Spinner } from '@/components/ui'

interface CalibrationDto {
  total: number
  done: number
  complete: boolean
  cards: CardDto[]
}

/**
 * S3 — Kalibrierung (PRD F2).
 *
 * Zwanzig handkuratierte Namen, die die fünf Stilachsen maximal aufspannen.
 * Unterbrechbar und wiederaufnehmbar. Das Profil erscheint erst danach — nicht
 * vorher, nicht schrittweise, und kein Fortschrittsbalken verrät, in welche
 * Richtung es gerade läuft.
 */
export default function CalibrationPage() {
  const router = useRouter()
  const { session, loading } = useSession()
  const [data, setData] = useState<CalibrationDto | null>(null)
  const [done, setDone] = useState(0)

  const load = useCallback(async () => {
    const result = await get<CalibrationDto>('/api/calibration')
    setData(result)
    setDone(result.done)
    if (result.complete) router.replace('/deck')
  }, [router])

  useEffect(() => {
    if (!loading && !session?.parent) router.replace('/')
  }, [loading, session, router])

  useEffect(() => {
    void load()
  }, [load])

  async function rate(card: CardDto, value: SwipeValue, reason?: { tag: string | null; share: boolean }) {
    await post('/api/ratings', {
      ref: card.ref,
      value,
      reasonTag: reason?.tag ?? null,
      sharedReason: reason?.share ?? false,
    })
    const next = done + 1
    setDone(next)
    if (next >= (data?.total ?? 20)) {
      await post('/api/calibration', {})
      router.push('/profil?erstmalig=1')
    }
  }

  if (loading || !data || !session?.couple) return <Spinner />

  return (
    <Screen>
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">
          Kalibrierung
        </p>
        <h1 className="display-name mt-3 text-2xl">Was gefällt dir?</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Zwanzig Namen, nur für dich. Nicht nachdenken — erkennen reicht.
        </p>
        <div className="mt-5 flex gap-1" aria-label={`${done} von ${data.total}`}>
          {Array.from({ length: data.total }, (_, i) => (
            <span
              key={i}
              className={`h-0.5 flex-1 rounded-full ${i < done ? 'bg-ink' : 'bg-line'}`}
            />
          ))}
        </div>
      </header>

      <SwipeDeck
        cards={data.cards}
        surname={session.couple.surname}
        vetosRemaining={0}
        onRate={rate}
        onNeedMore={() => {}}
      />

      <p className="mt-8 text-center text-xs text-ink-faint">
        Du kannst jederzeit aufhören und später weitermachen.
      </p>
    </Screen>
  )
}
