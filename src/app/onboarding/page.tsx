'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, post, type SoundDto } from '@/lib/client/api'
import { Button, Field, Notice, Screen, SoundLight, inputClass } from '@/components/ui'

/**
 * S2 — Nachname und Rahmendaten.
 *
 * PRD F1: Der Nachname ist Pflichtfeld. "Es gibt keine Namenseingabe ohne
 * Nachnamen. Nirgends." Deshalb steht er hier vor allem anderen — und wird
 * sofort gegen einen Beispielnamen geprüft, damit erkennbar wird, was das
 * Werkzeug später tut.
 */
export default function OnboardingPage() {
  const router = useRouter()
  const [surname, setSurname] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [genderPreference, setGenderPreference] = useState<'male' | 'female' | 'open'>('open')
  const [siblings, setSiblings] = useState('')
  const [secondLanguage, setSecondLanguage] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [preview, setPreview] = useState<{ name: string; sound: SoundDto }[]>([])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Vorschau: zwei sehr verschiedene Beispielnamen gegen den Nachnamen.
  useEffect(() => {
    const trimmed = surname.trim()
    if (trimmed.length < 2) {
      setPreview([])
      return
    }
    const timer = setTimeout(async () => {
      const samples = ['Mia', 'Ferdinand']
      const results = await Promise.all(
        samples.map(async (name) => {
          try {
            const { sound } = await post<{ sound: SoundDto }>('/api/sound', {
              firstName: name,
              surname: trimmed,
            })
            return { name, sound }
          } catch {
            return null
          }
        }),
      )
      setPreview(results.filter((r) => r !== null))
    }, 350)
    return () => clearTimeout(timer)
  }, [surname])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const result = await post<{ inviteCode: string }>('/api/session', {
        surname,
        displayName,
        genderPreference,
        siblingNames: siblings
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        secondaryLanguage: secondLanguage.trim() || null,
        dueDate: dueDate || null,
      })
      setInviteCode(result.inviteCode)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (inviteCode) {
    return (
      <Screen title="Der Raum steht">
        <p className="text-sm leading-relaxed text-ink-soft">
          Gib deinem Partner diesen Code. Du kannst schon anfangen — die Kalibrierung wartet nicht
          auf den Beitritt.
        </p>
        <div className="card-surface mt-7 py-10 text-center">
          <p className="display-name text-4xl tracking-[0.25em]">{inviteCode}</p>
        </div>
        <Button className="mt-8 w-full" onClick={() => router.push('/kalibrierung')}>
          Mit der Kalibrierung anfangen
        </Button>
      </Screen>
    )
  }

  return (
    <Screen
      title="Zuerst der Nachname"
      subtitle="Er entscheidet mit über jeden Vornamen — und wird sonst erst am Ende geprüft, wenn es weh tut."
    >
      <div className="space-y-6">
        <Field label="Nachname" hint="Pflichtfeld. Später änderbar, ohne dass Bewertungen verloren gehen.">
          <input
            className={inputClass}
            value={surname}
            onChange={(event) => setSurname(event.target.value)}
            placeholder="Ahrens"
            autoComplete="family-name"
          />
        </Field>

        {preview.length > 0 && (
          <div className="space-y-2 rounded-xl bg-accent-soft p-4">
            <p className="text-xs text-ink-faint">So klingt das:</p>
            {preview.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{entry.sound.fullName}</span>
                <SoundLight sound={entry.sound} />
              </div>
            ))}
          </div>
        )}

        <Field label="Dein Name">
          <input
            className={inputClass}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="wie dich dein Partner nennt"
            autoComplete="given-name"
          />
        </Field>

        <Field
          label="Geschlecht des Kindes"
          hint="Offen lassen ist ein vollwertiger Weg, keine Notlösung."
        >
          <div className="flex gap-2">
            {(
              [
                ['male', 'Junge'],
                ['female', 'Mädchen'],
                ['open', 'offen'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setGenderPreference(value)}
                className={`flex-1 rounded-full border py-2.5 text-xs transition-colors ${
                  genderPreference === value ? 'border-ink text-ink' : 'border-line text-ink-soft'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <details className="rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm text-ink-soft">Noch etwas dazu?</summary>
          <div className="mt-5 space-y-5">
            <Field
              label="Geschwisternamen"
              hint="Komma-getrennt. Wir prüfen dann, ob der neue Name klanglich dazu passt."
            >
              <input
                className={inputClass}
                value={siblings}
                onChange={(event) => setSiblings(event.target.value)}
                placeholder="Jonte, Frieda"
              />
            </Field>
            <Field
              label="Zweiter Sprachraum"
              hint="Bei binationalen Paaren: wo der Name außerdem gerufen wird."
            >
              <input
                className={inputClass}
                value={secondLanguage}
                onChange={(event) => setSecondLanguage(event.target.value)}
                placeholder="Italienisch"
              />
            </Field>
            <Field label="Entbindungstermin">
              <input
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </div>
        </details>

        {error && <Notice tone="warn">{error}</Notice>}

        <Button
          className="w-full"
          disabled={surname.trim().length < 2 || busy}
          onClick={() => void create()}
        >
          Raum anlegen
        </Button>
      </div>
    </Screen>
  )
}
