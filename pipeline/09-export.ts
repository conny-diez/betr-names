/**
 * Schritt 9 — export: statische Tabelle + ATTRIBUTIONS.md, gefiltert nach DISTRIBUTION_SAFE.
 *
 * PRD 9.1, bindende Anweisung: der Wechsel von Modus A (Eigengebrauch) nach
 * Modus B (Auslieferung an Dritte) darf keine Neuentwicklung erfordern. Er ist
 * hier genau ein Umgebungsschalter: `DISTRIBUTION_SAFE=true`.
 */
import { join } from 'node:path'
import { TUNING } from '../config/index.ts'
import { phoneticFields } from '../src/lib/phonetics/index.ts'
import type { CorpusName, StyleVector } from '../src/lib/types.ts'
import {
  CORPUS,
  DISTRIBUTION_SAFE,
  log,
  nameKey,
  readStage,
  step,
  warn,
  writeJson,
  writeText,
} from './lib.ts'
import { SOURCES } from './sources.ts'
import type { VectorizedName } from './07-vectorize.ts'
import calibrationFile from '../data/curated/calibration-set.json' with { type: 'json' }

const CALIBRATION = calibrationFile.names as {
  name: string
  gender: 'm' | 'f' | 'neutral'
  style_vector: StyleVector
}[]

/** Lizenzen, unter denen abgeleitete Daten an Dritte weitergegeben werden dürfen. */
const DISTRIBUTABLE = new Set(['CC BY 3.0 DE', 'CC0 1.0', 'DL-DE-Zero 2.0', 'proprietary-owned'])

function toCorpusName(entry: VectorizedName, index: number): CorpusName {
  return {
    id: `n${String(index).padStart(5, '0')}`,
    name: entry.name,
    gender: entry.gender,
    origin: entry.origin,
    meaning: entry.meaning,
    syllables: entry.syllables,
    stress_pattern: entry.stress_pattern,
    first_phoneme: entry.first_phoneme,
    last_phoneme: entry.last_phoneme,
    ends_with_vowel: entry.ends_with_vowel,
    starts_with_vowel: entry.starts_with_vowel,
    sibilant_count: entry.sibilant_count,
    phoneme_string: entry.phoneme_string,
    style_vector: entry.style_vector,
    frequency_by_year: entry.frequency_by_year,
    nicknames: entry.nicknames,
    rhyme_risks: entry.rhyme_risks,
    is_calibration_name: entry.is_calibration_name,
    variants: entry.variants,
    provenance: entry.provenance,
  }
}

/**
 * Fehlende Kalibrierungsnamen ergänzen.
 *
 * Das Kalibrierungsset ist handkuratiert (PRD 9.7) und muss vollständig sein,
 * sonst spannt es die Achsen nicht mehr auf. Namen, die in den Berliner Daten
 * nicht vorkommen — genau das macht sie ja selten — werden hier synthetisch
 * ergänzt: Phonetik aus der Regeltabelle, Stilvektor aus der Kuratierung,
 * `frequency` auf 1 (selten), keine Häufigkeitsdaten.
 */
function synthesizeMissing(present: Set<string>, startIndex: number): CorpusName[] {
  return CALIBRATION.filter((c) => !present.has(nameKey(c.name))).map((c, i) => ({
    id: `c${String(startIndex + i).padStart(5, '0')}`,
    name: c.name,
    gender: c.gender,
    origin: null,
    meaning: null,
    ...phoneticFields(c.name),
    style_vector: { ...c.style_vector, frequency: 1 },
    frequency_by_year: {},
    nicknames: [],
    rhyme_risks: [],
    is_calibration_name: true,
    variants: [],
    provenance: {
      name: { source_id: 'curated', license: 'proprietary-owned' },
      style_vector: { source_id: 'curated', license: 'proprietary-owned' },
      phonetics: { source_id: 'curated', license: 'proprietary-owned' },
    },
  }))
}

/**
 * Felder entfernen, deren Lizenz eine Weitergabe nicht deckt
 * (PRD 9.1, bindende Anweisung 2).
 */
export function applyDistributionFilter(
  names: CorpusName[],
  distributionSafe: boolean = DISTRIBUTION_SAFE,
): { names: CorpusName[]; removed: string[] } {
  if (!distributionSafe) return { names, removed: [] }
  const removed = new Set<string>()
  const filtered = names.map((n) => {
    const copy = { ...n }
    for (const [field, prov] of Object.entries(n.provenance)) {
      if (DISTRIBUTABLE.has(prov.license)) continue
      removed.add(`${field} (${prov.license})`)
      if (field === 'meaning') copy.meaning = null
      else if (field === 'origin') copy.origin = null
      else if (field === 'nicknames') copy.nicknames = []
      else if (field === 'rhyme_risks') copy.rhyme_risks = []
      delete copy.provenance[field]
    }
    return copy
  })
  return { names: filtered, removed: [...removed] }
}

/** ATTRIBUTIONS.md wird generiert, nicht von Hand gepflegt (PRD 9.1, Anweisung 3). */
export function buildAttributions(usedSourceIds: Set<string>): string {
  const used = [...usedSourceIds].map((id) => SOURCES[id]).filter(Boolean)
  const lines = [
    '# Quellen und Lizenzen',
    '',
    '> Diese Datei wird von `pipeline/09-export.ts` aus den `source_id`-Feldern des Korpus',
    '> erzeugt. Nicht von Hand bearbeiten — Änderungen gehören in `pipeline/sources.ts`.',
    '',
    `Build-Modus: **${DISTRIBUTION_SAFE ? 'B — Auslieferung an Dritte' : 'A — Eigengebrauch'}** (\`DISTRIBUTION_SAFE=${DISTRIBUTION_SAFE}\`)`,
    '',
    '## Verwendete Quellen',
    '',
  ]
  for (const source of used) {
    lines.push(`### ${source.title}`)
    lines.push('')
    lines.push(`- **Herausgeber:** ${source.publisher}`)
    if (source.url) lines.push(`- **Quelle:** ${source.url}`)
    lines.push(`- **Lizenz:** ${source.license}${source.licenseUrl ? ` (${source.licenseUrl})` : ''}`)
    if (source.attribution) lines.push(`- **Pflichtangabe:** ${source.attribution}`)
    if (source.note) lines.push(`- **Hinweis:** ${source.note}`)
    lines.push('')
  }

  const planned = Object.values(SOURCES).filter((s) => s.status === 'planned')
  if (planned.length) {
    lines.push('## Registriert, aber nicht angebunden')
    lines.push('')
    for (const s of planned) lines.push(`- ${s.title} — ${s.license}, ${s.url}`)
    lines.push('')
  }
  return lines.join('\n')
}

function main(): void {
  step('9 export')
  const { names } = readStage<{ names: VectorizedName[] }>('07-vectorize')

  const ranked = [...names].sort((a, b) => b.total - a.total)
  const selected = ranked
    .filter((n) => n.syllables > 0 && n.total >= TUNING.corpus.minFrequencyTotal)
    .slice(0, TUNING.corpus.targetSize)

  const corpus = selected.map(toCorpusName)
  const present = new Set(corpus.map((n) => nameKey(n.name)))
  const synthesized = synthesizeMissing(present, corpus.length)
  if (synthesized.length) {
    log(`${synthesized.length} Kalibrierungsname(n) synthetisch ergänzt: ${synthesized.map((n) => n.name).join(', ')}`)
  }

  const all = [...corpus, ...synthesized]
  const { names: distributable, removed } = applyDistributionFilter(all)

  if (DISTRIBUTION_SAFE) {
    log(`Modus B — ${removed.length ? `entfernte Felder: ${removed.join(', ')}` : 'keine Felder entfernt'}`)
  } else {
    warn('Modus A (Eigengebrauch). Für eine Auslieferung an Dritte: DISTRIBUTION_SAFE=true setzen.')
  }

  const usedSources = new Set<string>()
  for (const n of distributable) {
    for (const prov of Object.values(n.provenance)) usedSources.add(prov.source_id)
  }

  writeJson(join(CORPUS, 'names.json'), {
    version: 1,
    built_at: new Date().toISOString(),
    distribution_safe: DISTRIBUTION_SAFE,
    count: distributable.length,
    names: distributable,
  })
  writeText(join(CORPUS, 'ATTRIBUTIONS.md'), buildAttributions(usedSources))

  log(`${distributable.length} Namen exportiert nach data/corpus/names.json`)
  log(`${distributable.filter((n) => n.is_calibration_name).length} Kalibrierungsnamen`)
  log(`${distributable.filter((n) => n.nicknames.length).length} Namen mit Spitznamen`)
  log(`ATTRIBUTIONS.md mit ${usedSources.size} Quellen erzeugt`)
}

// Nur ausführen, wenn direkt aufgerufen — Tests importieren die Filterfunktionen.
if (import.meta.url === `file://${process.argv[1]}`) main()
