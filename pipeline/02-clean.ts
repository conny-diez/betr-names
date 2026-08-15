/**
 * Schritt 2 — clean: Müll filtern, Encoding vereinheitlichen, Groß-/Kleinschreibung.
 *
 * PRD 9.3.1: "In den Standesamtsdaten stehen Einträge, die keine Namen sind."
 * Ungefiltert verfälschen sie still den `frequency`-Wert und damit die gesamte
 * Stil-Engine.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAW, log, parseCsv, readJson, step, warn, writeStage } from './lib.ts'
import type { RawFile } from './01-fetch.ts'

export interface CleanRow {
  name: string
  count: number
  /** Rohwert der Quelle: m | w */
  gender: 'm' | 'w'
  /** null, wenn die Quelle keine Positionsangabe hat (Berlin vor 2017) */
  position: number | null
  year: number
  district: string
  source_id: string
  license: string
}

/**
 * Eigene Blacklist zusätzlich zur Berliner Liste. Bewusst kurz: was hier
 * hineinwandert, verschwindet still aus dem Korpus.
 */
const OWN_BLACKLIST = new Set([
  'unbekannt',
  'ohne',
  'kein',
  'keine',
  'namenlos',
  'nn',
  'n.n.',
  'baby',
  'kind',
  'vorname',
  'familienname',
  'nachname',
  'test',
])

function loadBerlinNonNames(): Set<string> {
  const path = join(RAW, 'berlin', 'non_names.txt')
  if (!existsSync(path)) {
    warn('conf/non_names.txt fehlt — nur eigene Filter aktiv')
    return new Set()
  }
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0),
  )
}

export interface RejectReason {
  name: string
  reason: string
  count: number
}

export function isName(raw: string, blocked: ReadonlySet<string>): string | null {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2) return null
  if (name.length > 20) return null
  if (/\d/.test(name)) return null
  // Erlaubt: Buchstaben inkl. diakritischer Zeichen, Bindestrich, Apostroph, Leerzeichen
  if (!/^[\p{L}][\p{L}\p{M}'\- ]*$/u.test(name)) return null
  if (blocked.has(name.toLowerCase())) return null
  if (OWN_BLACKLIST.has(name.toLowerCase())) return null
  // Großschreibung vereinheitlichen. Bindestrich UND Apostroph sind Wortgrenzen:
  // „N'Dea" und „anna-sophie" müssen beide korrekt herauskommen.
  return name
    .split(/(\s|-|')/)
    .map((part) =>
      /^[\s\-']$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join('')
}

function main(): void {
  step('2 clean')
  const manifest = readJson<{ files: RawFile[] }>(join(RAW, 'manifest.json'))
  const blocked = loadBerlinNonNames()
  log(`${blocked.size} Einträge aus der Berliner Nicht-Namen-Liste`)

  const rows: CleanRow[] = []
  const rejected = new Map<string, RejectReason>()

  for (const file of manifest.files) {
    const text = readFileSync(join(RAW, file.path), 'utf8')
    for (const row of parseCsv(text)) {
      const rawName = row.vorname ?? ''
      const count = Number(row.anzahl ?? '0')
      const gender = row.geschlecht === 'm' ? 'm' : 'w'
      const positionRaw = row.position
      const position = positionRaw === undefined || positionRaw === '' ? null : Number(positionRaw)

      const cleaned = isName(rawName, blocked)
      if (!cleaned || !Number.isFinite(count) || count <= 0) {
        const key = rawName.toLowerCase()
        const entry = rejected.get(key) ?? { name: rawName, reason: 'Filterregel', count: 0 }
        entry.count += Number.isFinite(count) ? count : 1
        rejected.set(key, entry)
        continue
      }

      rows.push({
        name: cleaned,
        count,
        gender,
        position,
        year: file.year,
        district: file.district,
        source_id: file.source_id,
        license: file.license,
      })
    }
  }

  log(`${rows.length} Zeilen behalten, ${rejected.size} verschiedene Einträge verworfen`)
  const top = [...rejected.values()].sort((a, b) => b.count - a.count).slice(0, 12)
  if (top.length) log(`häufigste Verwürfe: ${top.map((r) => `${r.name || '∅'}(${r.count})`).join(', ')}`)

  writeStage('02-clean', { rows, rejected: [...rejected.values()] })
}

// Nur ausführen, wenn direkt aufgerufen — Tests importieren die Filterfunktionen.
if (import.meta.url === `file://${process.argv[1]}`) main()
