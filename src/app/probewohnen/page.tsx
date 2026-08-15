'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { get, post, put, type CardDto } from '@/lib/client/api'
import { CallTest, Button, Nav, Notice, Screen, Spinner } from '@/components/ui'

type Trial = CardDto & {
  startDate: string
  days: number
  verdictDue: boolean
  ownVerdict: 'better' | 'same' | 'worse' | null
  partnerHasVoted: boolean
  partnerVerdict: 'better' | 'same' | 'worse' | null
  dueDate: string | null
  daysUntilDue: number | null
}

interface TrialDto {
  trial: Trial | null
  suggestions: CardDto[]
  history: { name_ref: string; start_date: string; verdict_a: string | null; verdict_b: string | null }[]
}

const VERDICT_LABEL = {
  better: 'besser geworden',
  same: 'gleich geblieben',
  worse: 'schlechter geworden',
} as const

/**
 * S11 — Probewohnen (PRD F8).
 *
 * "Nichts entlarvt einen Namen so schnell wie sieben Tage mit ihm." Die App
 * benutzt den Namen der Woche beiläufig in ihren eigenen Texten — genau das
 * ist der Test.
 */
export default function TrialPage() {
  const [data, setData] = useState<TrialDto | null>(null)

  const load = useCallback(async () => {
    setData(await get<TrialDto>('/api/trial'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <Spinner />

  if (!data.trial) {
    return (
      <>
        <Screen
          title="Probewohnen"
          subtitle="Ein Name für eine Woche. Wir benutzen ihn danach beiläufig, so wie ihr es tun würdet."
        >
          {data.suggestions.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-faint">
              Dafür braucht es erst eine Shortlist. Bewertet noch ein paar Namen.
            </p>
          ) : (
            <div className="space-y-3">
              {data.suggestions.map((card) => (
                <button
                  key={card.ref}
                  type="button"
                  onClick={async () => {
                    await put('/api/trial', { ref: card.ref })
                    await load()
                  }}
                  className="card-surface w-full px-5 py-5 text-left"
                >
                  <p className="display-name text-2xl">{card.name}</p>
                  <p className="mt-1 text-sm text-ink-faint">
                    eine Woche lang {card.sound.fullName}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Screen>
        <Nav />
      </>
    )
  }

  const trial = data.trial
  const bothVoted = trial.ownVerdict !== null && trial.partnerVerdict !== null

  return (
    <>
      <Screen>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">
          Name der Woche · Tag {Math.min(7, trial.days + 1)}
        </p>
        <h1 className="display-name mt-4 text-4xl">{trial.name}</h1>
        <p className="mt-1 text-lg text-ink-faint">
          {trial.sound.fullName.split(' ').slice(1).join(' ')}
        </p>
        <div className="mt-4">
          <CallTest fullName={trial.sound.fullName} />
        </div>

        {/* Beiläufige Verwendung — der eigentliche Test (PRD F8). */}
        <div className="mt-8 space-y-3">
          {trial.daysUntilDue !== null && (
            <p className="text-sm leading-relaxed text-ink-soft">
              Noch {trial.daysUntilDue} Tage, bis {trial.name} da ist.
            </p>
          )}
          <p className="text-sm leading-relaxed text-ink-soft">
            Wie war die Woche mit {trial.name}?
          </p>
        </div>

        <section className="mt-8">
          {!trial.verdictDue && trial.ownVerdict === null ? (
            <Notice>
              Am Wochenende bewertet ihr unabhängig voneinander. Bis dahin: benutzt den Namen
              einfach. Laut, im Alltag, gegenüber anderen.
            </Notice>
          ) : (
            <>
              <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                Dein Urteil
              </h2>
              <div className="mt-3 space-y-2">
                {(['better', 'same', 'worse'] as const).map((verdict) => (
                  <button
                    key={verdict}
                    type="button"
                    onClick={async () => {
                      await post('/api/trial', { verdict })
                      await load()
                    }}
                    className={`w-full rounded-xl border px-5 py-3.5 text-left text-sm transition-colors ${
                      trial.ownVerdict === verdict
                        ? 'border-ink text-ink'
                        : 'border-line text-ink-soft'
                    }`}
                  >
                    {VERDICT_LABEL[verdict]}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ink-faint">
                {bothVoted
                  ? `Dein Partner sagt: ${VERDICT_LABEL[trial.partnerVerdict!]}.`
                  : trial.partnerHasVoted
                    ? 'Dein Partner hat schon abgestimmt. Was, siehst du, sobald du selbst gestimmt hast.'
                    : 'Dein Partner hat noch nicht abgestimmt.'}
              </p>
            </>
          )}
        </section>

        <Link
          href="/shortlist"
          className="mt-9 block text-center text-xs text-ink-faint underline underline-offset-4"
        >
          anderen Namen probewohnen
        </Link>
      </Screen>
      <Nav />
    </>
  )
}
