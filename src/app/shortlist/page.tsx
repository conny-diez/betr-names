'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { get, put, type CardDto } from '@/lib/client/api'
import { NameSheet } from '@/components/NameSheet'
import { CallTest, Nav, Notice, Screen, SoundLight, Spinner } from '@/components/ui'

type Entry = CardDto & { combined: number; ownRating: number; comparisons: number }

interface ShortlistDto {
  locked: boolean
  have?: number
  need?: number
  stable?: boolean
  comparisonsDone?: number
  comparisonsNeeded?: number
  entries: Entry[]
  secondNameSuggestion: {
    variantA: { label: string; sound: number; flags: string[] }
    variantB: { label: string; sound: number; flags: string[] }
    note: string
  } | null
}

/**
 * S10 — Shortlist (PRD F7) mit Zweitname-Ventil (PRD F9).
 *
 * Am Ende sollen drei bis fünf Namen stehen. Deshalb wird der Rest der Liste
 * eingeklappt statt gelöscht: eine Shortlist mit fünfzehn Einträgen ist keine.
 */
export default function ShortlistPage() {
  const [data, setData] = useState<ShortlistDto | null>(null)
  const [open, setOpen] = useState<CardDto | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setData(await get<ShortlistDto>('/api/shortlist'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <Spinner />

  if (data.locked) {
    return (
      <>
        <Screen title="Shortlist">
          <p className="text-sm leading-relaxed text-ink-soft">
            Ab {data.need} Matches entsteht hier eine Reihenfolge. Ihr habt {data.have}.
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

  const visible = showAll ? data.entries : data.entries.slice(0, 5)

  return (
    <>
      <Screen
        title="Shortlist"
        subtitle={
          data.stable
            ? 'Die Reihenfolge steht. Sie mittelt eure beiden Rankings — beide Stimmen zählen gleich.'
            : `Noch nicht stabil: ${data.comparisonsDone} von etwa ${data.comparisonsNeeded} Vergleichen.`
        }
      >
        <ol className="space-y-3">
          {visible.map((entry, index) => (
            <li key={entry.ref}>
              <div
                className="card-surface px-5 py-4"
                role="button"
                tabIndex={0}
                onClick={() => setOpen(entry)}
                onKeyDown={(event) => event.key === 'Enter' && setOpen(entry)}
              >
                <div className="flex items-start gap-4">
                  <span className="display-name mt-1 text-lg text-ink-faint">{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="display-name text-2xl">{entry.name}</p>
                        <p className="mt-0.5 text-sm text-ink-faint">
                          {entry.sound.fullName.split(' ').slice(1).join(' ')}
                        </p>
                      </div>
                      <SoundLight sound={entry.sound} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div onClick={(event) => event.stopPropagation()}>
                        <CallTest fullName={entry.sound.fullName} />
                      </div>
                      {index < 3 && (
                        <button
                          type="button"
                          onClick={async (event) => {
                            event.stopPropagation()
                            await put('/api/trial', { ref: entry.ref })
                            window.location.href = '/probewohnen'
                          }}
                          className="text-xs text-ink-faint underline underline-offset-4"
                        >
                          eine Woche probewohnen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {data.entries.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="mx-auto mt-5 block text-xs text-ink-faint underline underline-offset-4"
          >
            {showAll ? 'nur die Top 5' : `die übrigen ${data.entries.length - 5} auch zeigen`}
          </button>
        )}

        {/* --- Zweitname-Ventil (PRD F9) --- */}
        {data.secondNameSuggestion && (
          <section className="mt-10">
            <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Ein dritter Weg
            </h2>
            <div className="mt-3">
              <Notice>{data.secondNameSuggestion.note}</Notice>
            </div>
            <div className="mt-4 space-y-3">
              {[data.secondNameSuggestion.variantA, data.secondNameSuggestion.variantB].map(
                (variant) => (
                  <div key={variant.label} className="card-surface px-5 py-4">
                    <p className="display-name text-xl">{variant.label}</p>
                    <p className="mt-1.5 text-xs text-ink-faint">
                      Klang der ganzen Kombination: {variant.sound} von 100
                      {variant.flags.filter((f) => !f.endsWith('_good')).length > 0 &&
                        ` · ${variant.flags.filter((f) => !f.endsWith('_good')).join(', ')}`}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        )}

        <Link
          href="/vergleich"
          className="mt-9 block rounded-full bg-accent-soft py-3 text-center text-sm text-ink"
        >
          Weiter vergleichen
        </Link>
      </Screen>

      {open && <NameSheet card={open} onClose={() => setOpen(null)} showNicknameVoting />}
      <Nav />
    </>
  )
}
