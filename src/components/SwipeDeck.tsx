'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardDto } from '@/lib/client/api'
import { REASON_TAGS, SHAREABLE_REASON } from '@/lib/types'
import { NameCard } from './NameCard'
import { NameSheet } from './NameSheet'

export type SwipeValue = 'love' | 'like' | 'pass' | 'veto'

const THRESHOLD = 90
const LONG_PRESS_MS = 550

/**
 * Das Swipe-Deck (PRD F3, S5).
 *
 * Gesten laut PRD 5.3.1: hoch = love, rechts = like, links = pass,
 * Long-press = veto.
 *
 * Was hier bewusst **fehlt**, ist so wichtig wie das, was da ist (PRD 7):
 * kein rotes X, kein Aufblitzen, kein Sound. Eine Ablehnung sieht genauso aus
 * wie eine Zustimmung — nur die Richtung ist anders. Das Produkt darf nie den
 * Eindruck erwecken, ein Nein sei ein Fehler.
 */
export function SwipeDeck({
  cards,
  surname,
  vetosRemaining,
  onRate,
  onNeedMore,
}: {
  cards: CardDto[]
  surname: string
  vetosRemaining: number
  onRate: (card: CardDto, value: SwipeValue, reason?: { tag: string | null; share: boolean }) => Promise<void>
  onNeedMore: () => void
}) {
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [leaving, setLeaving] = useState<{ x: number; y: number } | null>(null)
  const [detail, setDetail] = useState<CardDto | null>(null)
  const [reasonFor, setReasonFor] = useState<{ card: CardDto; value: SwipeValue } | null>(null)
  const [busy, setBusy] = useState(false)

  const start = useRef<{ x: number; y: number } | null>(null)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moved = useRef(false)

  const card = cards[index]
  const next = cards[index + 1]

  useEffect(() => {
    if (cards.length - index <= 8) onNeedMore()
  }, [cards.length, index, onNeedMore])

  useEffect(() => {
    setIndex(0)
  }, [cards[0]?.ref])

  const commit = useCallback(
    async (value: SwipeValue, direction: { x: number; y: number }) => {
      if (!card || busy) return
      setBusy(true)
      setLeaving(direction)
      setDrag(null)
      try {
        await onRate(card, value)
      } finally {
        setTimeout(() => {
          setLeaving(null)
          setIndex((i) => i + 1)
          setBusy(false)
        }, 180)
      }
    },
    [card, busy, onRate],
  )

  function clearLongPress() {
    if (longPress.current) {
      clearTimeout(longPress.current)
      longPress.current = null
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    if (busy || !card) return
    start.current = { x: event.clientX, y: event.clientY }
    moved.current = false
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    clearLongPress()
    longPress.current = setTimeout(() => {
      if (moved.current) return
      // Veto ist knapp (PRD 4.4) — es bekommt deshalb eine eigene, bewusste
      // Geste und eine Rückfrage, keinen Wisch.
      if (vetosRemaining > 0) setReasonFor({ card, value: 'veto' })
      start.current = null
      setDrag(null)
    }, LONG_PRESS_MS)
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      moved.current = true
      clearLongPress()
    }
    setDrag({ x: dx, y: dy })
  }

  function onPointerUp() {
    clearLongPress()
    const offset = drag
    start.current = null
    setDrag(null)
    if (!offset || !card) return

    if (offset.y < -THRESHOLD && Math.abs(offset.y) > Math.abs(offset.x)) {
      void commit('love', { x: 0, y: -600 })
    } else if (offset.x > THRESHOLD) {
      void commit('like', { x: 600, y: 0 })
    } else if (offset.x < -THRESHOLD) {
      // Grund-Tag ist optional (PRD 5.3.3): erst wischen, dann fragen, und die
      // Frage lässt sich überspringen.
      setReasonFor({ card, value: 'pass' })
    }
  }

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="display-name text-2xl">Für heute durch</p>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
          Ihr habt alles gesehen, was gerade zu euch passt. Neue Vorschläge entstehen, sobald einer
          von euch weiterbewertet.
        </p>
      </div>
    )
  }

  const offset = leaving ?? drag ?? { x: 0, y: 0 }
  const rotation = leaving ? offset.x / 30 : (drag?.x ?? 0) / 40

  return (
    <>
      <div className="relative h-[30rem] select-none">
        {next && (
          <div className="absolute inset-0 scale-[0.97] opacity-60" aria-hidden>
            <NameCard card={next} surname={surname} />
          </div>
        )}

        <div
          className="swipe-card absolute inset-0"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
            transition: drag ? 'none' : 'transform 180ms cubic-bezier(0.2,0.7,0.3,1)',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <NameCard card={card} surname={surname} onOpenDetail={() => setDetail(card)} />
        </div>
      </div>

      {/* Tasten für alle, die nicht wischen wollen oder können. */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <ActionButton label="eher nicht" onClick={() => setReasonFor({ card, value: 'pass' })} />
        <ActionButton label="gefällt mir" onClick={() => void commit('like', { x: 600, y: 0 })} />
        <ActionButton
          label="Favorit"
          emphasis
          onClick={() => void commit('love', { x: 0, y: -600 })}
        />
      </div>

      <button
        type="button"
        disabled={vetosRemaining === 0}
        onClick={() => setReasonFor({ card, value: 'veto' })}
        className="mx-auto mt-4 block text-xs text-ink-faint underline underline-offset-4 disabled:no-underline disabled:opacity-50"
      >
        {vetosRemaining > 0
          ? `Veto einsetzen — ${vetosRemaining} von 5 übrig`
          : 'Keine Vetos mehr übrig'}
      </button>

      {detail && <NameSheet card={detail} onClose={() => setDetail(null)} />}

      {reasonFor && (
        <ReasonDialog
          value={reasonFor.value}
          onCancel={() => setReasonFor(null)}
          onConfirm={async (tag, share) => {
            const { card: target, value } = reasonFor
            setReasonFor(null)
            setBusy(true)
            setLeaving(value === 'veto' ? { x: 0, y: 600 } : { x: -600, y: 0 })
            try {
              await onRate(target, value, { tag, share })
            } finally {
              setTimeout(() => {
                setLeaving(null)
                setIndex((i) => i + 1)
                setBusy(false)
              }, 180)
            }
          }}
        />
      )}
    </>
  )
}

function ActionButton({
  label,
  onClick,
  emphasis = false,
}: {
  label: string
  onClick: () => void
  emphasis?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2.5 text-xs transition-colors ${
        emphasis ? 'border-ink text-ink' : 'border-line text-ink-soft hover:border-line-strong'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Grund-Tags (PRD 5.3.3).
 *
 * Optional, privat, und nur „erinnert mich an jemanden" lässt sich — mit
 * ausdrücklicher Zustimmung — teilen. Ohne den Namen zu nennen.
 */
function ReasonDialog({
  value,
  onCancel,
  onConfirm,
}: {
  value: SwipeValue
  onCancel: () => void
  onConfirm: (tag: string | null, share: boolean) => Promise<void>
}) {
  const [tag, setTag] = useState<string | null>(null)
  const [share, setShare] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20" onClick={onCancel}>
      <div
        className="w-full max-w-[32rem] rounded-t-3xl bg-paper-raised px-6 pb-10 pt-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="display-name text-2xl">
          {value === 'veto' ? 'Veto einsetzen?' : 'Warum nicht?'}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {value === 'veto'
            ? 'Ein Veto nimmt den Namen dauerhaft aus dem Pool — für euch beide. Dein Partner sieht nur den Zähler, nie den Namen. Du kannst es jederzeit zurücknehmen.'
            : 'Freiwillig. Der Grund bleibt bei dir und verbessert nur, was dir als Nächstes gezeigt wird.'}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {REASON_TAGS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setTag(tag === option ? null : option)
                if (option !== SHAREABLE_REASON) setShare(false)
              }}
              className={`rounded-full border px-3.5 py-2 text-xs transition-colors ${
                tag === option ? 'border-ink text-ink' : 'border-line text-ink-soft'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {tag === SHAREABLE_REASON && (
          <label className="mt-5 flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3">
            <input
              type="checkbox"
              checked={share}
              onChange={(event) => setShare(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed text-ink-soft">
              Deinem Partner zeigen, dass es hier eine persönliche Assoziation gab — ohne den Namen
              zu nennen. Über diesen Grund lässt sich nicht streiten; ausgesprochen entschärft er.
            </span>
          </label>
        )}

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-line py-3 text-sm text-ink-soft"
          >
            zurück
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(tag, share)}
            className="flex-1 rounded-full bg-ink py-3 text-sm text-paper"
          >
            {value === 'veto' ? 'Veto einsetzen' : tag ? 'weiter' : 'ohne Grund weiter'}
          </button>
        </div>
      </div>
    </div>
  )
}
