/**
 * Schritt 6 — enrich: Wikidata-Abgleich, Spitznamen-Mapping, Reimliste, Bedeutung.
 *
 * PRD 9.4: Behind the Name ist für eine ausgelieferte App lizenzrechtlich nicht
 * gedeckt. Deshalb Wikidata (CC0) für das Sprachsignal und selbst formulierte
 * Texte für Bedeutung und Herkunft.
 */
import { TUNING } from '../config/index.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { INTERIM, log, nameKey, readJson, readStage, sleep, step, warn, writeJson, writeStage } from './lib.ts'
import type { PhonemizedName } from './05-phonemize.ts'
import nicknamesFile from '../data/curated/nicknames.json' with { type: 'json' }
import rhymeFile from '../data/curated/rhyme-risks.json' with { type: 'json' }
import meaningsFile from '../data/curated/meanings.json' with { type: 'json' }

const NICKNAMES = nicknamesFile.map as Record<string, string[]>
const RHYMES = rhymeFile.risks as Record<string, string[]>
const MEANINGS = meaningsFile.entries as Record<string, { origin: string; meaning: string }>

export interface EnrichedName extends PhonemizedName {
  nicknames: string[]
  rhyme_risks: string[]
  origin: string | null
  meaning: string | null
  /** Zahl der Wikipedia-Sprachversionen; null, wenn kein Wikidata-Treffer */
  wikidata_sitelinks: number | null
  provenance: Record<string, { source_id: string; license: string }>
}

const WIKIDATA_CACHE = join(INTERIM, 'wikidata-sitelinks.json')
const BATCH_SIZE = 150

/**
 * Sprachverbreitung aus Wikidata. Zahl der Wikipedia-Sprachversionen des
 * Vornamen-Items ist ein grobes, aber brauchbares Signal für die Achse `reach`
 * (PRD 9.6: "`reach` aus der Anzahl Sprachräume in Wikidata").
 */
async function fetchSitelinks(names: string[]): Promise<Record<string, number>> {
  const cached: Record<string, number> = existsSync(WIKIDATA_CACHE)
    ? readJson<Record<string, number>>(WIKIDATA_CACHE)
    : {}

  const missing = names.filter((n) => !(nameKey(n) in cached))
  if (!missing.length) {
    log(`Wikidata: ${Object.keys(cached).length} Einträge aus dem Cache`)
    return cached
  }

  log(`Wikidata: ${missing.length} Namen abzufragen (${Math.ceil(missing.length / BATCH_SIZE)} Batches)`)

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE)
    const values = batch.map((n) => `"${n.replace(/"/g, '')}"@de`).join(' ')
    const query = `SELECT ?label (MAX(?sl) AS ?sitelinks) WHERE {
  VALUES ?label { ${values} }
  ?item rdfs:label ?label ; wdt:P31/wdt:P279* wd:Q202444 ; wikibase:sitelinks ?sl .
} GROUP BY ?label`

    // WDQS antwortet unter Last mit 502/429. Drei Anläufe mit wachsender
    // Pause; danach bricht der Schritt ab und der regelbasierte Ersatz greift.
    let ok = false
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await fetch(
          `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
          {
            headers: {
              Accept: 'application/sparql-results+json',
              'User-Agent': 'zwei-listen-corpus-build/0.1 (Namenskorpus, privates Projekt)',
            },
          },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as {
          results: { bindings: { label: { value: string }; sitelinks?: { value: string } }[] }
        }
        // Erst alle Batch-Namen auf 0 setzen, damit Nicht-Treffer nicht bei
        // jedem Lauf erneut angefragt werden.
        for (const n of batch) cached[nameKey(n)] = 0
        for (const b of json.results.bindings) {
          cached[nameKey(b.label.value)] = Number(b.sitelinks?.value ?? 0)
        }
        ok = true
        process.stdout.write(
          `\r  Wikidata: ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}`,
        )
      } catch (error) {
        if (attempt === 3) {
          process.stdout.write('\n')
          warn(
            `Wikidata-Batch fehlgeschlagen (${(error as Error).message}) — regelbasierter Ersatz greift`,
          )
        } else {
          await sleep(attempt * 3000)
        }
      }
    }
    if (!ok) break
    // Freundliche Taktung gegenüber einem kostenlos betriebenen Dienst.
    await sleep(200)
  }
  process.stdout.write('\n')
  writeJson(WIKIDATA_CACHE, cached)
  return cached
}

function lookupNicknames(name: string): string[] {
  const direct = NICKNAMES[nameKey(name)]
  if (direct) return direct
  // Bindestrich-Namen erben die Kurzformen ihres ersten Teils.
  const firstPart = name.split(/[\s-]/)[0]
  if (firstPart !== name) return NICKNAMES[nameKey(firstPart)] ?? []
  return []
}

async function main(): Promise<void> {
  step('6 enrich')
  const { names } = readStage<{ names: PhonemizedName[] }>('05-phonemize')

  // Nur Namen anreichern, die es realistisch in den Korpus schaffen — Wikidata
  // muss nicht für 9000 Einzelnennungen befragt werden.
  const ranked = [...names].sort((a, b) => b.total - a.total)
  const enrichLimit = Math.round(TUNING.corpus.targetSize * 1.4)
  const forWikidata = ranked.slice(0, enrichLimit).map((n) => n.name)

  const useWikidata = !process.argv.includes('--no-wikidata')
  const sitelinks = useWikidata ? await fetchSitelinks(forWikidata) : {}
  if (!useWikidata) warn('Wikidata übersprungen (--no-wikidata)')

  const out: EnrichedName[] = names.map((entry) => {
    const key = nameKey(entry.name)
    const meaning = MEANINGS[key] ?? null
    const provenance: EnrichedName['provenance'] = {
      name: { source_id: entry.source_ids[0] ?? 'berlin-vornamen', license: 'CC BY 3.0 DE' },
      frequency_by_year: {
        source_id: entry.source_ids[0] ?? 'berlin-vornamen',
        license: 'CC BY 3.0 DE',
      },
      phonetics: { source_id: 'curated', license: 'proprietary-owned' },
      nicknames: { source_id: 'curated', license: 'proprietary-owned' },
      rhyme_risks: { source_id: 'curated', license: 'proprietary-owned' },
    }
    if (meaning) {
      provenance.meaning = { source_id: 'self-authored', license: 'proprietary-owned' }
      provenance.origin = { source_id: 'self-authored', license: 'proprietary-owned' }
    }
    const sl = sitelinks[key]
    if (sl !== undefined) {
      provenance.wikidata_sitelinks = { source_id: 'wikidata', license: 'CC0 1.0' }
    }

    return {
      ...entry,
      nicknames: lookupNicknames(entry.name),
      rhyme_risks: RHYMES[key] ?? [],
      origin: meaning?.origin ?? null,
      meaning: meaning?.meaning ?? null,
      wikidata_sitelinks: sl ?? null,
      provenance,
    }
  })

  log(`${out.filter((n) => n.nicknames.length).length} Namen mit Spitznamen`)
  log(`${out.filter((n) => n.meaning).length} Namen mit Bedeutungstext`)
  log(`${out.filter((n) => n.wikidata_sitelinks !== null).length} Namen mit Wikidata-Signal`)
  log(`${out.filter((n) => n.rhyme_risks.length).length} Namen mit Reim-Risiko`)

  writeStage('06-enrich', { names: out })
}

await main()
