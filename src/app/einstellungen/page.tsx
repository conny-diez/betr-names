'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, del, get, patch, type SoundDto } from '@/lib/client/api'
import { post } from '@/lib/client/api'
import { useSession } from '@/lib/client/hooks'
import { Button, Field, Nav, Notice, Screen, SoundLight, Spinner, inputClass } from '@/components/ui'

/**
 * S13 — Einstellungen.
 *
 * Nachname ändern, Vetos verwalten, Daten löschen. Die Löschung ist
 * absichtlich nicht versteckt und hat keine Wartefrist (PRD 11).
 */
export default function SettingsPage() {
  const router = useRouter()
  const { session, loading, reload } = useSession()
  const [surname, setSurname] = useState('')
  const [siblings, setSiblings] = useState('')
  const [preview, setPreview] = useState<SoundDto | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (session?.couple) {
      setSurname(session.couple.surname)
      setSiblings(session.couple.siblingNames.join(', '))
    }
  }, [session?.couple])

  useEffect(() => {
    const trimmed = surname.trim()
    if (trimmed.length < 2) return setPreview(null)
    const timer = setTimeout(async () => {
      try {
        const result = await post<{ sound: SoundDto }>('/api/sound', {
          firstName: 'Mia',
          surname: trimmed,
        })
        setPreview(result.sound)
      } catch {
        setPreview(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [surname])

  if (loading || !session?.couple || !session.parent) return <Spinner />

  async function save() {
    setError(null)
    try {
      await patch('/api/couple', {
        surname,
        siblingNames: siblings
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
      await reload()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Nicht gespeichert.')
    }
  }

  return (
    <>
      <Screen title="Einstellungen">
        <section className="space-y-5">
          <Field
            label="Nachname"
            hint="Alle Klangbewertungen werden sofort neu gerechnet. Eure Bewertungen bleiben erhalten."
          >
            <input
              className={inputClass}
              value={surname}
              onChange={(event) => setSurname(event.target.value)}
            />
          </Field>

          {preview && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
              <span className="text-sm text-ink">{preview.fullName}</span>
              <SoundLight sound={preview} />
            </div>
          )}

          <Field label="Geschwisternamen" hint="Komma-getrennt.">
            <input
              className={inputClass}
              value={siblings}
              onChange={(event) => setSiblings(event.target.value)}
              placeholder="Jonte, Frieda"
            />
          </Field>

          <Button className="w-full" onClick={() => void save()}>
            {saved ? 'gespeichert' : 'speichern'}
          </Button>
          {error && <Notice tone="warn">{error}</Notice>}
        </section>

        {/* --- Vetos (PRD 5.3.2) --- */}
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Vetos</h2>
          <div className="mt-3 card-surface px-5 py-4">
            <p className="text-sm text-ink">
              Du hast noch {session.parent.vetosRemaining} von 5.
            </p>
            {session.partner && (
              <p className="mt-1 text-sm text-ink-faint">
                {session.partner.displayName} hat noch {session.partner.vetosRemaining} von 5.
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              Welche Namen betroffen sind, sieht der jeweils andere nie — auch nicht hier. Der
              Zähler zeigt nur, dass Ablehnung ernst genommen wird.
            </p>
            <Link
              href="/vetos"
              className="mt-3 inline-block text-xs text-ink-soft underline underline-offset-4"
            >
              eigene Vetos ansehen und zurücknehmen
            </Link>
          </div>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Mehr</h2>
          <NavLink href="/profil">Dein Stilprofil</NavLink>
          <NavLink href="/probewohnen">Probewohnen</NavLink>
          <NavLink href="/divergenz">Eure Muster im Vergleich</NavLink>
          {!session.partner && (
            <div className="card-surface px-5 py-4">
              <p className="text-sm text-ink-soft">Einladungscode</p>
              <p className="display-name mt-1 text-2xl tracking-[0.2em]">
                {session.couple.inviteCode}
              </p>
            </div>
          )}
        </section>

        {/* --- Löschen (PRD 11) --- */}
        <section className="mt-12 border-t border-line pt-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">Daten</h2>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            Hier entsteht ein Datensatz über ein ungeborenes Kind und über Meinungsverschiedenheiten
            zwischen euch. Ihr könnt ihn jederzeit vollständig löschen — sofort, ohne Rückfrage und
            durch jeden von euch beiden.
          </p>
          {confirmDelete ? (
            <div className="mt-4 flex gap-3">
              <Button variant="quiet" className="flex-1" onClick={() => setConfirmDelete(false)}>
                doch nicht
              </Button>
              <button
                type="button"
                onClick={async () => {
                  await del('/api/couple')
                  router.replace('/')
                }}
                className="flex-1 rounded-full bg-light-red py-3 text-sm text-paper"
              >
                alles löschen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-4 text-sm text-light-red underline underline-offset-4"
            >
              Raum und alle Daten löschen
            </button>
          )}
        </section>

        {session.corpus && (
          <p className="mt-10 text-[11px] leading-relaxed text-ink-faint">
            {session.corpus.count} Namen im Korpus, gebaut aus den Vornamenslisten der Berliner
            Standesämter 2012–2023. „Selten" heißt darin: selten in deutschen Städten.
          </p>
        )}
      </Screen>
      <Nav />
    </>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="card-surface block px-5 py-4 text-sm text-ink">
      {children}
    </Link>
  )
}
