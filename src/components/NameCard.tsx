'use client'

import type { CardDto } from '@/lib/client/api'
import { CallTest, SoundLight } from './ui'

/**
 * Die Karte (PRD F3 / S5).
 *
 * Vorname groß, **Nachname direkt darunter, immer sichtbar** — das ist keine
 * Layoutfrage, sondern Kernprinzip 3: kein Name wird jemals ohne Nachnamen
 * angezeigt.
 */
export function NameCard({
  card,
  surname,
  onOpenDetail,
}: {
  card: CardDto
  surname: string
  onOpenDetail?: () => void
}) {
  const latestYear = Object.keys(card.frequencyByYear).sort().at(-1)
  const latestCount = latestYear ? Math.round(card.frequencyByYear[latestYear]) : null

  return (
    <article className="card-surface flex h-full flex-col justify-between p-7">
      <div>
        <div className="flex items-start justify-between gap-3">
          <SoundLight sound={card.sound} />
          {card.source === 'bridge' && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-faint">
              Vorschlag
            </span>
          )}
        </div>

        <div className="mt-7">
          <h2 className="display-name text-5xl text-ink">{card.name}</h2>
          <p className="mt-2 text-xl text-ink-faint">{surname}</p>
        </div>

        <dl className="mt-7 space-y-1.5 text-sm text-ink-soft">
          {(card.origin || card.meaning) && (
            <div className="leading-relaxed">
              {card.origin && <span className="text-ink-faint">{card.origin}</span>}
              {card.origin && card.meaning && <span className="text-ink-faint"> · </span>}
              {card.meaning}
            </div>
          )}
          <div className="text-ink-faint">
            {latestCount !== null
              ? // PRD 9.3.3: ehrlich formulieren, die Daten sind urban.
                `${latestCount} Mal in Berlin ${latestYear}`
              : 'in den Standesamtsdaten nicht aufgetaucht'}
            {card.syllables > 0 && ` · ${card.syllables} Silbe${card.syllables === 1 ? '' : 'n'}`}
          </div>
          {card.variants.length > 0 && (
            <div className="text-ink-faint">
              auch: {card.variants.slice(0, 3).join(', ')}
            </div>
          )}
        </dl>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <CallTest fullName={card.sound.fullName} />
        {onOpenDetail && (
          <button
            type="button"
            onClick={onOpenDetail}
            className="text-xs text-ink-faint underline underline-offset-4 hover:text-ink-soft"
          >
            mehr
          </button>
        )}
      </div>
    </article>
  )
}
