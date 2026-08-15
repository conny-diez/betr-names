'use client'

import { useState } from 'react'
import type { CardDto } from '@/lib/client/api'
import { post } from '@/lib/client/api'
import { CallTest, SoundLight } from './ui'

/**
 * Namensdetail als Sheet (PRD S6).
 *
 * Klang-Flags im Klartext, Häufigkeitsverlauf, Rufprobe, Spitznamen.
 * Die Flags erklären sich selbst — eine Ampel ohne Begründung erzeugt nur
 * Misstrauen gegen das Werkzeug.
 */
export function NameSheet({
  card,
  onClose,
  showNicknameVoting = false,
  nicknameVotes,
}: {
  card: CardDto
  onClose: () => void
  showNicknameVoting?: boolean
  nicknameVotes?: Record<string, { own: boolean | null; partner: boolean | null }>
}) {
  const [votes, setVotes] = useState(nicknameVotes ?? {})
  const years = Object.keys(card.frequencyByYear).sort()
  const max = Math.max(1, ...years.map((y) => card.frequencyByYear[y]))

  const penalties = card.sound.flags.filter((f) => f.kind === 'penalty')
  const bonuses = card.sound.flags.filter((f) => f.kind === 'bonus')
  const infos = card.sound.flags.filter((f) => f.kind === 'info')

  async function vote(nickname: string, approves: boolean) {
    const result = await post<{ votes: typeof votes }>('/api/nicknames', {
      ref: card.ref,
      nickname,
      approves,
    })
    setVotes(result.votes)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full max-w-[32rem] overflow-y-auto rounded-t-3xl bg-paper-raised px-6 pb-10 pt-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="display-name text-4xl">{card.name}</h2>
            <p className="mt-1 text-lg text-ink-faint">{card.sound.fullName.split(' ').slice(1).join(' ')}</p>
          </div>
          <SoundLight sound={card.sound} />
        </div>

        <div className="mt-4">
          <CallTest fullName={card.sound.fullName} />
        </div>

        {(card.origin || card.meaning) && (
          <p className="mt-5 text-sm leading-relaxed text-ink-soft">
            {card.origin && <span className="text-ink-faint">{card.origin} · </span>}
            {card.meaning}
          </p>
        )}

        {/* --- Klang im Klartext (PRD 5.1.2) --- */}
        {(penalties.length > 0 || bonuses.length > 0) && (
          <section className="mt-7">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Klang mit dem Nachnamen
            </h3>
            <ul className="mt-3 space-y-3">
              {[...penalties, ...bonuses].map((flag) => (
                <li key={flag.code} className="flex gap-3">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      flag.kind === 'bonus' ? 'bg-light-green' : 'bg-light-yellow'
                    }`}
                  />
                  <p className="text-sm leading-relaxed text-ink-soft">{flag.explanation}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {infos.length > 0 && (
          <section className="mt-6">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Noch aufgefallen
            </h3>
            <ul className="mt-3 space-y-3">
              {infos.map((flag) => (
                <li key={flag.code} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" />
                  <p className="text-sm leading-relaxed text-ink-soft">{flag.explanation}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Genitiv-Probe (PRD 5.1.3) */}
        <p className="mt-6 text-sm text-ink-faint">
          Im Alltag: „{card.sound.genitive}"
        </p>

        {/* --- Häufigkeitsverlauf --- */}
        {years.length > 1 && (
          <section className="mt-7">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Häufigkeit
            </h3>
            <div className="mt-3 flex h-16 items-end gap-1">
              {years.map((year) => (
                <div key={year} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-accent-soft"
                    style={{ height: `${Math.max(4, (card.frequencyByYear[year] / max) * 100)}%` }}
                    title={`${year}: ${Math.round(card.frequencyByYear[year])}`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              {years[0]}–{years.at(-1)}, Erstnamen in Berlin. Selten heißt hier: selten in deutschen
              Städten.
            </p>
          </section>
        )}

        {/* --- Spitznamen (PRD F6) --- */}
        {card.nicknames.length > 0 && (
          <section className="mt-7">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Kurzformen
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              Man wählt einen Namen und ruft achtzehn Jahre lang die Kurzform.
            </p>
            <ul className="mt-3 space-y-2">
              {card.nicknames.map((nickname) => {
                const vote_ = votes[nickname]
                return (
                  <li
                    key={nickname}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5"
                  >
                    <span className="text-sm">{nickname}</span>
                    {showNicknameVoting ? (
                      <span className="flex items-center gap-2">
                        {vote_?.own !== null && vote_?.partner !== null && vote_ !== undefined && (
                          <span className="text-[11px] text-ink-faint">
                            {vote_.partner ? 'beide dafür' : 'ihr seid uneins'}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void vote(nickname, false)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            vote_?.own === false ? 'border-ink text-ink' : 'border-line text-ink-faint'
                          }`}
                        >
                          eher nicht
                        </button>
                        <button
                          type="button"
                          onClick={() => void vote(nickname, true)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            vote_?.own === true ? 'border-ink text-ink' : 'border-line text-ink-faint'
                          }`}
                        >
                          mag ich
                        </button>
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-8 w-full rounded-full bg-accent-soft py-3 text-sm text-ink"
        >
          schließen
        </button>
      </div>
    </div>
  )
}
