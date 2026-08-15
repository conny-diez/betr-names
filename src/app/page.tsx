'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { post, put, ApiError } from '@/lib/client/api'
import { useSession } from '@/lib/client/hooks'
import { Button, Field, Notice, Screen, Spinner, inputClass } from '@/components/ui'

/**
 * S1 — Willkommen, Raum anlegen oder beitreten.
 *
 * Kein Account, kein Passwort: ein Einladungscode reicht (PRD 10).
 */
export default function WelcomePage() {
  const router = useRouter()
  const { session, loading } = useSession()
  const [mode, setMode] = useState<'start' | 'join'>('start')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && session?.parent) {
      router.replace(session.parent.calibrationComplete ? '/deck' : '/kalibrierung')
    }
  }, [loading, session, router])

  if (loading || session?.parent) return <Spinner />

  async function join() {
    setBusy(true)
    setError(null)
    try {
      await put('/api/session', { code, displayName })
      router.push('/kalibrierung')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <div className="rise">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">Zwei Listen</p>
        <h1 className="display-name mt-5 text-4xl leading-[1.1]">
          Ihr sucht keinen Namen.
          <br />
          Ihr verhandelt einen.
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-ink-soft">
          Jeder bewertet für sich. Ihr seht ausschließlich, worin ihr übereinstimmt — nie, was der
          andere abgelehnt hat. Der Nachname ist von der ersten Karte an dabei.
        </p>
      </div>

      <div className="mt-10 space-y-3">
        {mode === 'start' ? (
          <>
            <Button className="w-full" onClick={() => router.push('/onboarding')}>
              Raum anlegen
            </Button>
            <Button variant="quiet" className="w-full" onClick={() => setMode('join')}>
              Ich habe einen Einladungscode
            </Button>
          </>
        ) : (
          <div className="space-y-5 rise">
            <Field label="Einladungscode" hint="Sechs Zeichen, von deinem Partner.">
              <input
                className={`${inputClass} uppercase tracking-[0.3em]`}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </Field>
            <Field label="Dein Name" hint="Nur damit ihr euch im Raum unterscheiden könnt.">
              <input
                className={inputClass}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="given-name"
              />
            </Field>
            {error && <Notice tone="warn">{error}</Notice>}
            <div className="flex gap-3">
              <Button variant="quiet" className="flex-1" onClick={() => setMode('start')}>
                zurück
              </Button>
              <Button className="flex-1" disabled={code.length < 6 || busy} onClick={() => void join()}>
                beitreten
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-12 text-xs leading-relaxed text-ink-faint">
        Es gibt keine Freigabe an Dritte, keine Umfrage, keinen Voting-Link. Externe Meinungen
        zerstören mehr Namen, als sie retten — deshalb ist diese Funktion nicht vorgesehen.
      </p>
    </Screen>
  )
}
