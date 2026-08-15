'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { get, type CardDto } from '@/lib/client/api'
import { useRoomEvents, useSession } from '@/lib/client/hooks'
import { NameSheet } from '@/components/NameSheet'
import { CallTest, Nav, Screen, SoundLight, Spinner } from '@/components/ui'

type MatchDto = CardDto & {
  isSuper: boolean
  createdAt: string
  nicknameVotes: Record<string, { own: boolean | null; partner: boolean | null }>
}

interface MatchesDto {
  matches: MatchDto[]
  rankingUnlocked: boolean
  unlockAt: number
}

/**
 * S7 — Matches (PRD F5).
 *
 * Ausschließlich Namen, die beide mit `like` oder `love` bewertet haben.
 * Der leere Zustand ist hier keine Nebensache: die ersten Sessions haben oft
 * null Matches, und der Screen darf sich nicht wie ein Scheitern anfühlen.
 */
export default function MatchesPage() {
  const { session } = useSession()
  const [data, setData] = useState<MatchesDto | null>(null)
  const [open, setOpen] = useState<MatchDto | null>(null)

  const load = useCallback(async () => {
    setData(await get<MatchesDto>('/api/matches'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useRoomEvents(
    useCallback(
      (event) => {
        if (event.type === 'match') void load()
      },
      [load],
    ),
    Boolean(session?.parent),
  )

  if (!data) return <Spinner />

  const supers = data.matches.filter((m) => m.isSuper)
  const rest = data.matches.filter((m) => !m.isSuper)

  return (
    <>
      <Screen title="Matches">
        {data.matches.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {supers.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-super">
                  Ihr beide liebt
                </h2>
                <div className="space-y-3">
                  {supers.map((match) => (
                    <MatchRow key={match.ref} match={match} onOpen={() => setOpen(match)} highlight />
                  ))}
                </div>
              </section>
            )}

            {rest.length > 0 && (
              <section>
                {supers.length > 0 && (
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
                    Ihr mögt beide
                  </h2>
                )}
                <div className="space-y-3">
                  {rest.map((match) => (
                    <MatchRow key={match.ref} match={match} onOpen={() => setOpen(match)} />
                  ))}
                </div>
              </section>
            )}

            <div className="mt-9">
              {data.rankingUnlocked ? (
                <Link
                  href="/vergleich"
                  className="block rounded-full bg-ink py-3 text-center text-sm text-paper"
                >
                  In eine Reihenfolge bringen
                </Link>
              ) : (
                <p className="text-center text-xs text-ink-faint">
                  Ab {data.unlockAt} Matches könnt ihr sie in eine Reihenfolge bringen. Noch{' '}
                  {data.unlockAt - data.matches.length} zu gehen.
                </p>
              )}
            </div>
          </>
        )}
      </Screen>

      {open && (
        <NameSheet
          card={open}
          onClose={() => setOpen(null)}
          showNicknameVoting
          nicknameVotes={open.nicknameVotes}
        />
      )}
      <Nav />
    </>
  )
}

function MatchRow({
  match,
  onOpen,
  highlight = false,
}: {
  match: MatchDto
  onOpen: () => void
  highlight?: boolean
}) {
  return (
    <div
      className={`card-surface px-5 py-4 ${highlight ? 'border-super/30 bg-super-bg' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === 'Enter' && onOpen()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="display-name text-2xl">{match.name}</p>
          <p className="mt-0.5 text-sm text-ink-faint">
            {match.sound.fullName.split(' ').slice(1).join(' ')}
          </p>
        </div>
        <SoundLight sound={match.sound} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div onClick={(event) => event.stopPropagation()}>
          <CallTest fullName={match.sound.fullName} />
        </div>
        {match.nicknames.length > 0 && (
          <p className="text-xs text-ink-faint">{match.nicknames.slice(0, 3).join(' · ')}</p>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-10">
      <p className="display-name text-2xl leading-snug">Noch nichts Gemeinsames.</p>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        Das ist normal und kein schlechtes Zeichen. Die ersten Sessions bringen meistens null
        Übereinstimmungen — ihr habt gerade erst angefangen, unabhängig voneinander zu sortieren.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        Was hier später steht, hat den Vorteil, dass ihr beide unbeeinflusst dafür wart. Das ist
        mehr wert als eine lange Liste.
      </p>
      <Link
        href="/deck"
        className="mt-7 block rounded-full bg-accent-soft py-3 text-center text-sm text-ink"
      >
        Weiter bewerten
      </Link>
    </div>
  )
}
