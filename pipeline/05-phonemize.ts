/**
 * Schritt 5 — phonemize: Lautschrift, Silbenzahl und Betonung über den ganzen Korpus.
 *
 * PRD 9.5 nennt espeak-ng als Werkzeug und weist darauf hin, dass Silbenebene
 * und Betonung selbst abgeleitet werden müssen. Wir benutzen stattdessen die
 * eigene Regeltabelle aus `src/lib/phonetics` — dieselbe, die zur Laufzeit
 * nutzereingegebene Nachnamen verarbeitet. Der Grund ist nicht Bequemlichkeit:
 * zwei verschiedene G2P-Implementierungen würden Korpus und Eingabemaske
 * auseinanderlaufen lassen, und der Klang-Score verglich dann Äpfel mit Birnen.
 */
import { phoneticFields } from '../src/lib/phonetics/index.ts'
import { log, readStage, step, writeStage } from './lib.ts'
import type { MergedName } from './04-merge.ts'
import type { Phonetics } from '../src/lib/types.ts'

export interface PhonemizedName extends MergedName, Phonetics {}

function main(): void {
  step('5 phonemize')
  const { names } = readStage<{ names: MergedName[] }>('04-merge')

  const out: PhonemizedName[] = names.map((entry) => ({
    ...entry,
    ...phoneticFields(entry.name),
  }))

  const syllableHistogram = new Map<number, number>()
  for (const n of out) syllableHistogram.set(n.syllables, (syllableHistogram.get(n.syllables) ?? 0) + 1)
  const histogram = [...syllableHistogram.entries()].sort((a, b) => a[0] - b[0])
  log(`Silbenverteilung: ${histogram.map(([s, c]) => `${s}σ:${c}`).join('  ')}`)

  const suspicious = out.filter((n) => n.syllables === 0 || n.phoneme_string.length === 0)
  if (suspicious.length) {
    log(`${suspicious.length} Namen ohne ableitbare Lautschrift: ${suspicious.slice(0, 8).map((n) => n.name).join(', ')}`)
  }

  writeStage('05-phonemize', { names: out })
}

main()
