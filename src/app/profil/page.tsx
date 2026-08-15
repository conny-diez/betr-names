'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { get } from '@/lib/client/api'
import { Button, Nav, Screen, Spinner } from '@/components/ui'
import { AXIS_POLES } from '@/lib/style/profile'
import type { StyleAxis, StyleVector } from '@/lib/types'

interface ProfileDto {
  vector: StyleVector
  confidence: Record<StyleAxis, number>
  confidentAxes: StyleAxis[]
  headline: string
  summary: string
  statements: { axis: StyleAxis; direction: number; phrase: string; strength: number }[]
  ratingCount: number
}

const AXIS_ORDER: StyleAxis[] = ['era', 'softness', 'reach', 'frequency', 'ambiguity']

/**
 * S4 — Profil-Ergebnis.
 *
 * PRD 5.2.2: "Dieser Moment ist ein Selbsterkenntnis-Erlebnis und der erste
 * Payoff des Produkts — er verdient einen eigenen Screen, keine Nebenzeile."
 * Achsen mit niedriger Confidence werden ausdrücklich als unentschieden
 * gezeigt statt als Ergebnis behauptet.
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProfileInner />
    </Suspense>
  )
}

function ProfileInner() {
  const router = useRouter()
  const params = useSearchParams()
  const firstTime = params.get('erstmalig') === '1'
  const [profile, setProfile] = useState<ProfileDto | null>(null)

  useEffect(() => {
    get<ProfileDto>('/api/profile')
      .then(setProfile)
      .catch(() => router.replace('/kalibrierung'))
  }, [router])

  if (!profile) return <Spinner />

  return (
    <>
      <Screen>
        <div className="rise">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">
            {firstTime ? 'Dein Muster' : 'Dein Profil'}
          </p>
          <h1 className="display-name mt-4 text-4xl leading-tight">{profile.headline}</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">{profile.summary}</p>
        </div>

        <section className="mt-10 space-y-5">
          {AXIS_ORDER.map((axis) => {
            const value = profile.vector[axis]
            const confident = profile.confidentAxes.includes(axis)
            return (
              <div key={axis}>
                <div className="flex justify-between text-xs text-ink-faint">
                  <span>{AXIS_POLES[axis].low}</span>
                  <span>{AXIS_POLES[axis].high}</span>
                </div>
                <div className="relative mt-2 h-1.5 rounded-full bg-line">
                  {confident && (
                    <span
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                      style={{ left: `${value * 100}%` }}
                    />
                  )}
                </div>
                {!confident && (
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    Hier legst du dich nicht fest — die Achse zählt bei dir weniger.
                  </p>
                )}
              </div>
            )
          })}
        </section>

        <p className="mt-9 text-xs leading-relaxed text-ink-faint">
          Aus {profile.ratingCount} Bewertungen. Das Profil verschiebt sich mit jedem weiteren
          Swipe — es ist eine Beobachtung, kein Urteil.
        </p>

        {firstTime ? (
          <Button className="mt-8 w-full" onClick={() => router.push('/deck')}>
            Weiter zum Deck
          </Button>
        ) : (
          <Link
            href="/kalibrierung"
            className="mt-8 block text-center text-xs text-ink-faint underline underline-offset-4"
          >
            Kalibrierung wiederholen
          </Link>
        )}
      </Screen>
      {!firstTime && <Nav />}
    </>
  )
}
