'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { get, post, type CardDto } from '@/lib/client/api'
import { CallTest, Nav, Screen, SoundLight, Spinner } from '@/components/ui'

interface CompareDto {
  locked: boolean
  have?: number
  need?: number
  stable?: boolean
  comparisonsDone?: number
  comparisonsNeeded?: number
  pair: (CardDto | null)[] | null
}

/**
 * S9 — Paarvergleich (PRD F7).
 *
 * Kein Sternesystem: Sterne landen erfahrungsgemäß alle bei vier. Zwei Namen,
 * eine Entscheidung, Elo macht daraus eine Rangfolge. Beide antworten
 * unabhängig — auch hier sieht niemand, wie der andere gestimmt hat.
 */
export default function ComparePage() {
  const [data, setData] = useState<CompareDto | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setData(await get<CompareDto>('/api/compare'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function choose(winner: string, loser: string) {
    setBusy(true)
    try {
      await post('/api/compare', { winner, loser })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Spinner />

  if (data.locked) {
    return (
      <>
        <Screen title="Reihenfolge">
          <p className="text-sm leading-relaxed text-ink-soft">
            Der Vergleich schaltet sich bei {data.need} Matches frei. Ihr habt {data.have}.
          </p>
          <Link
            href="/deck"
            className="mt-7 block rounded-full bg-accent-soft py-3 text-center text-sm text-ink"
          >
            Weiter bewerten
          </Link>
        </Screen>
        <Nav />
      </>
    )
  }

  const [left, right] = data.pair ?? [null, null]

  if (!left || !right) {
    return (
      <>
        <Screen title="Reihenfolge">
          <p className="text-sm leading-relaxed text-ink-soft">
            Du hast alle Paare verglichen. Die Shortlist steht.
          </p>
          <Link
            href="/shortlist"
            className="mt-7 block rounded-full bg-ink py-3 text-center text-sm text-paper"
          >
            Zur Shortlist
          </Link>
        </Screen>
        <Nav />
      </>
    )
  }

  return (
    <>
      <Screen>
        <header className="mb-7">
          <h1 className="display-name text-2xl">{left.name} oder {right.name}?</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Nicht abwägen. Der erste Impuls ist die ehrlichere Antwort.
          </p>
          {data.comparisonsNeeded && (
            <p className="mt-3 text-xs text-ink-faint">
              {data.stable
                ? 'Die Reihenfolge steht stabil — jeder weitere Vergleich schärft nur noch.'
                : `${data.comparisonsDone} von etwa ${data.comparisonsNeeded} Vergleichen`}
            </p>
          )}
        </header>

        <div className="space-y-4">
          {[left, right].map((card, i) => {
            const other = i === 0 ? right : left
            return (
              <button
                key={card.ref}
                type="button"
                disabled={busy}
                onClick={() => void choose(card.ref, other.ref)}
                className="card-surface w-full px-6 py-7 text-left transition-transform active:scale-[0.99] disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="display-name text-3xl">{card.name}</p>
                    <p className="mt-1 text-sm text-ink-faint">
                      {card.sound.fullName.split(' ').slice(1).join(' ')}
                    </p>
                  </div>
                  <SoundLight sound={card.sound} />
                </div>
                <div className="mt-4" onClick={(event) => event.stopPropagation()}>
                  <CallTest fullName={card.sound.fullName} />
                </div>
              </button>
            )
          })}
        </div>

        <Link
          href="/shortlist"
          className="mt-8 block text-center text-xs text-ink-faint underline underline-offset-4"
        >
          Zwischenstand ansehen
        </Link>
      </Screen>
      <Nav />
    </>
  )
}
