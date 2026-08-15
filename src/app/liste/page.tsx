'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApiError, get, post, type CardDto, type SoundDto } from '@/lib/client/api'
import { useSession } from '@/lib/client/hooks'
import { NameSheet } from '@/components/NameSheet'
import { Button, Nav, Notice, Screen, SoundLight, Spinner, inputClass } from '@/components/ui'

type OwnName = CardDto & { ownRating: string | null }

/**
 * S8 — Eigene Liste (PRD F4).
 *
 * Namen, die nicht im Korpus stehen. Das System schätzt Stilvektor und Klang
 * selbst. Wichtig ist der Satz darunter: der eigene Name landet unmarkiert im
 * Deck des Partners. Wer weiß, dass ein Name vom anderen kommt, bewertet nicht
 * mehr den Namen, sondern die Beziehung.
 */
export default function OwnListPage() {
  const { session } = useSession()
  const [names, setNames] = useState<OwnName[]>([])
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<SoundDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<CardDto | null>(null)

  const load = useCallback(async () => {
    const result = await get<{ names: OwnName[] }>('/api/custom-names')
    setNames(result.names)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Live-Klangbewertung während der Eingabe — der Nachname ist immer dabei.
  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed.length < 2) {
      setPreview(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const result = await post<{ sound: SoundDto }>('/api/sound', { firstName: trimmed })
        setPreview(result.sound)
      } catch {
        setPreview(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [input])

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await post('/api/custom-names', { name: input.trim() })
      setInput('')
      setPreview(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (!session?.couple) return <Spinner />

  return (
    <>
      <Screen
        title="Eigene Liste"
        subtitle="Namen, die dir eingefallen sind. Sie laufen unmarkiert im Deck deines Partners mit — ohne Hinweis, von wem sie kommen."
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Vorname"
              onKeyDown={(event) => event.key === 'Enter' && input.trim().length >= 2 && void add()}
            />
            <Button disabled={input.trim().length < 2 || busy} onClick={() => void add()}>
              +
            </Button>
          </div>

          {preview && (
            <div className="card-surface flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="display-name text-xl">{preview.fullName}</p>
                {preview.flags.filter((f) => f.kind !== 'bonus').length > 0 && (
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                    {preview.flags.find((f) => f.kind === 'penalty')?.explanation ??
                      preview.flags[0]?.explanation}
                  </p>
                )}
              </div>
              <SoundLight sound={preview} />
            </div>
          )}

          {error && <Notice tone="warn">{error}</Notice>}
        </div>

        <section className="mt-9">
          {names.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-faint">
              Noch nichts hier. Namen aus dem Bekanntenkreis, aus Büchern, aus dem Urlaub — alles,
              was der Korpus nicht kennt, gehört hierher.
            </p>
          ) : (
            <div className="space-y-3">
              {names.map((name) => (
                <div
                  key={name.ref}
                  className="card-surface flex items-center justify-between gap-3 px-5 py-4"
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(name)}
                  onKeyDown={(event) => event.key === 'Enter' && setOpen(name)}
                >
                  <div>
                    <p className="display-name text-xl">{name.name}</p>
                    <p className="text-xs text-ink-faint">
                      {name.ownRating
                        ? { love: 'dein Favorit', like: 'gefällt dir', pass: 'eher nicht', veto: 'Veto' }[
                            name.ownRating as 'love' | 'like' | 'pass' | 'veto'
                          ]
                        : 'noch nicht von dir bewertet'}
                    </p>
                  </div>
                  <SoundLight sound={name.sound} />
                </div>
              ))}
            </div>
          )}
        </section>
      </Screen>

      {open && <NameSheet card={open} onClose={() => setOpen(null)} />}
      <Nav />
    </>
  )
}
