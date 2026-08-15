/**
 * Alle Pipeline-Schritte nacheinander.
 *
 * PRD 9.8 verlangt ausdrücklich **keinen** monolithischen Build: jeder Schritt
 * bleibt ein eigenes Skript mit eigenem Zwischenergebnis. Diese Datei ruft die
 * Skripte nur der Reihe nach auf — wer an Schritt 3 etwas korrigiert, startet
 * ab Schritt 3 neu und muss nicht wieder durch die Wikidata-Abfrage.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ROOT } from './lib.ts'

const STEPS = [
  '01-fetch.ts',
  '02-clean.ts',
  '03-normalize.ts',
  '04-merge.ts',
  '05-phonemize.ts',
  '06-enrich.ts',
  '07-vectorize.ts',
  '08-validate.ts',
  '09-export.ts',
]

const from = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1]
const passthrough = process.argv.filter((a) => a.startsWith('--') && !a.startsWith('--from='))

const startIndex = from ? STEPS.findIndex((s) => s.startsWith(from)) : 0
if (startIndex < 0) {
  console.error(`Unbekannter Schritt "${from}". Verfügbar: ${STEPS.join(', ')}`)
  process.exit(1)
}

for (const script of STEPS.slice(startIndex)) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(ROOT, 'pipeline', script), ...passthrough],
    { stdio: 'inherit', cwd: ROOT },
  )
  if (result.status !== 0) {
    console.error(`\nAbbruch in ${script}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nKorpus gebaut: data/corpus/names.json')
