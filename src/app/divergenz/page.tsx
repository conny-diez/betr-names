'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { get, post } from '@/lib/client/api'
import { Button, Screen, Spinner } from '@/components/ui'

interface DivergenceDto {
  available: boolean
  triggered?: boolean
  alreadyShown?: boolean
  intro?: string
  lines?: { axis: string; gap: number; text: string }[]
  distance?: number
  reason?: string
}

/**
 * S12 — Divergenz-Report (PRD 5.3.5).
 *
 * "Das ist häufig der wertvollste Moment im gesamten Prozess — es verlagert
 * das Gespräch von ‚ich mag deinen Namen nicht' zu ‚wir haben unterschiedliche
 * Muster'."
 *
 * Nirgendwo eine Kompatibilitäts-Prozentzahl (PRD 7). Der Report benennt
 * Muster, er bewertet keine Beziehung.
 */
export default function DivergencePage() {
  const router = useRouter()
  const [data, setData] = useState<DivergenceDto | null>(null)

  useEffect(() => {
    get<DivergenceDto>('/api/divergence').then(setData).catch(() => setData({ available: false }))
  }, [])

  if (!data) return <Spinner />

  if (!data.available || !data.triggered) {
    return (
      <Screen title="Eure Muster">
        <p className="text-sm leading-relaxed text-ink-soft">
          {data.reason ??
            'Eure Geschmäcker liegen nah beieinander. Es gibt hier nichts zu erklären — das ist die angenehmere Variante.'}
        </p>
        <Button variant="quiet" className="mt-8 w-full" onClick={() => router.push('/deck')}>
          zurück zum Deck
        </Button>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="rise">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">
          Ihr sucht unterschiedlich
        </p>
        <h1 className="display-name mt-4 text-3xl leading-tight">
          Das ist keine schlechte Nachricht.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{data.intro}</p>
      </div>

      <ul className="mt-9 space-y-5">
        {data.lines?.map((line) => (
          <li key={line.axis} className="border-l-2 border-line pl-4">
            <p className="text-base leading-relaxed text-ink">{line.text}</p>
          </li>
        ))}
      </ul>

      <p className="mt-9 text-xs leading-relaxed text-ink-faint">
        Ab hier schlägt euch das Werkzeug bevorzugt Namen vor, die zwischen euren beiden Mustern
        liegen — und regelmäßig welche, die weit außerhalb liegen. Erfahrungsgemäß entstehen genau
        dort die stärksten Übereinstimmungen.
      </p>

      <Button
        className="mt-8 w-full"
        onClick={async () => {
          await post('/api/divergence', {})
          router.push('/deck')
        }}
      >
        verstanden
      </Button>
    </Screen>
  )
}
