'use client'

import { useCallback, useEffect, useState } from 'react'
import { del, get, type CardDto } from '@/lib/client/api'
import { Nav, Screen, SoundLight, Spinner } from '@/components/ui'

type VetoEntry = CardDto & { reasonTag: string | null }

/**
 * Vetos verwalten (PRD S13).
 *
 * Zeigt ausschließlich die eigenen. Ein Veto zurückzunehmen gibt es sofort
 * wieder frei (PRD 5.3.2) — der Name landet dabei auf „eher nicht" und
 * springt nicht zurück ins Deck. Wer ein Veto zurücknimmt, will es überdenken,
 * nicht die Karte erneut sehen.
 */
export default function VetosPage() {
  const [data, setData] = useState<{ vetos: VetoEntry[]; remaining: number } | null>(null)

  const load = useCallback(async () => {
    setData(await get<{ vetos: VetoEntry[]; remaining: number }>('/api/ratings'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <Spinner />

  return (
    <>
      <Screen
        title="Deine Vetos"
        subtitle={`${data.remaining} von 5 noch frei. Dein Partner sieht nur diese Zahl — nie die Namen.`}
      >
        {data.vetos.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-faint">
            Du hast noch keins eingesetzt. Vetos sind knapp, damit „ich mag ihn nicht" keine
            Kränkung sein muss, sondern eine Entscheidung über eine begrenzte Ressource.
          </p>
        ) : (
          <div className="space-y-3">
            {data.vetos.map((veto) => (
              <div key={veto.ref} className="card-surface px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="display-name text-2xl">{veto.name}</p>
                    {veto.reasonTag && (
                      <p className="mt-0.5 text-xs text-ink-faint">{veto.reasonTag}</p>
                    )}
                  </div>
                  <SoundLight sound={veto.sound} />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await del(`/api/ratings?ref=${encodeURIComponent(veto.ref)}`)
                    await load()
                  }}
                  className="mt-3 text-xs text-ink-soft underline underline-offset-4"
                >
                  Veto zurücknehmen
                </button>
              </div>
            ))}
          </div>
        )}
      </Screen>
      <Nav />
    </>
  )
}
