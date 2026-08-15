/**
 * Schritt 4 — merge: Städte zusammenführen, Häufigkeit pro Jahr aggregieren.
 *
 * Hier wird das Positionsproblem aus PRD 9.3.2 aufgelöst. Berlin liefert die
 * Spalte `position` erst ab 2017; davor zählt jede Zeile alle Vornamen
 * einschließlich Zweit- und Drittnamen. Ein globaler Korrekturfaktor würde
 * genau die Namen verzerren, um die es geht: „Marie" und „Sophie" stehen weit
 * überwiegend an zweiter Stelle, „Noah" fast immer an erster. Deshalb wird der
 * Faktor **pro Name** aus den Jahren mit Positionsangabe geschätzt, mit einem
 * globalen Rückfall für Namen mit zu dünner Datenlage.
 */
import { log, nameKey, readStage, step, writeStage } from './lib.ts'
import type { NormalizedRow } from './03-normalize.ts'

export interface MergedName {
  key: string
  name: string
  /** Beobachtete Schreibvarianten, absteigend nach Häufigkeit */
  variants: string[]
  genderCounts: { m: number; w: number }
  /** Erstnamen-Häufigkeit pro Jahr (gemessen oder geschätzt) */
  frequency_by_year: Record<string, number>
  /** Jahre, deren Wert über den Positionsfaktor geschätzt wurde */
  estimated_years: string[]
  total: number
  source_ids: string[]
  /** Anteil Erstnamen an allen Positionen, aus den Jahren mit Positionsangabe */
  first_name_share: number
  share_estimated: boolean
}

/** Mindestzahl positionierter Nennungen, ab der ein eigener Faktor belastbar ist. */
const MIN_POSITIONED_FOR_OWN_SHARE = 20

function main(): void {
  step('4 merge')
  const { rows } = readStage<{ rows: NormalizedRow[] }>('03-normalize')

  // --- Positionsfaktor je Name aus den Jahren mit Positionsangabe -----------
  const positioned = new Map<string, { first: number; all: number }>()
  let globalFirst = 0
  let globalAll = 0
  for (const row of rows) {
    if (row.positionUnknown) continue
    const key = nameKey(row.canonical)
    const entry = positioned.get(key) ?? { first: 0, all: 0 }
    entry.all += row.count
    if (row.isFirstName) entry.first += row.count
    positioned.set(key, entry)
    globalAll += row.count
    if (row.isFirstName) globalFirst += row.count
  }
  const globalShare = globalAll > 0 ? globalFirst / globalAll : 1
  log(`globaler Erstnamen-Anteil: ${(globalShare * 100).toFixed(1)} %`)

  const shareOf = (key: string): { share: number; estimated: boolean } => {
    const entry = positioned.get(key)
    if (!entry || entry.all < MIN_POSITIONED_FOR_OWN_SHARE) {
      return { share: globalShare, estimated: true }
    }
    return { share: entry.first / entry.all, estimated: false }
  }

  // --- Aggregation ----------------------------------------------------------
  const merged = new Map<string, MergedName>()
  const spellingCounts = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const key = nameKey(row.canonical)
    const { share, estimated } = shareOf(key)

    let entry = merged.get(key)
    if (!entry) {
      entry = {
        key,
        name: row.canonical,
        variants: [],
        genderCounts: { m: 0, w: 0 },
        frequency_by_year: {},
        estimated_years: [],
        total: 0,
        source_ids: [],
        first_name_share: share,
        share_estimated: estimated,
      }
      merged.set(key, entry)
    }

    // Zeilen ohne Positionsangabe werden mit dem namensspezifischen Faktor
    // auf Erstnamen heruntergerechnet; Zeilen mit Position != 1 fallen raus.
    let contribution = 0
    if (row.positionUnknown) {
      contribution = row.count * share
      const y = String(row.year)
      if (!entry.estimated_years.includes(y)) entry.estimated_years.push(y)
    } else if (row.isFirstName) {
      contribution = row.count
    }

    if (contribution > 0) {
      const y = String(row.year)
      entry.frequency_by_year[y] = (entry.frequency_by_year[y] ?? 0) + contribution
      entry.total += contribution
      entry.genderCounts[row.gender] += contribution
    }

    if (!entry.source_ids.includes(row.source_id)) entry.source_ids.push(row.source_id)

    const spellings = spellingCounts.get(key) ?? new Map<string, number>()
    spellings.set(row.name, (spellings.get(row.name) ?? 0) + row.count)
    spellingCounts.set(key, spellings)
  }

  for (const [key, entry] of merged) {
    for (const y of Object.keys(entry.frequency_by_year)) {
      entry.frequency_by_year[y] = Math.round(entry.frequency_by_year[y] * 10) / 10
    }
    entry.total = Math.round(entry.total * 10) / 10
    entry.genderCounts.m = Math.round(entry.genderCounts.m)
    entry.genderCounts.w = Math.round(entry.genderCounts.w)
    entry.estimated_years.sort()

    const spellings = [...(spellingCounts.get(key) ?? new Map())].sort((a, b) => b[1] - a[1])
    // Häufigste Schreibweise gewinnt als Anzeigename, alle übrigen bleiben
    // als Varianten sichtbar (PRD 9.3, Schluss).
    if (spellings.length) entry.name = spellings[0][0]
    entry.variants = spellings.slice(1).map(([s]) => s)
  }

  const all = [...merged.values()].filter((e) => e.total > 0).sort((a, b) => b.total - a.total)
  log(`${all.length} verschiedene Namen nach Zusammenführung`)
  log(`Top 10: ${all.slice(0, 10).map((e) => `${e.name} (${Math.round(e.total)})`).join(', ')}`)
  log(
    `${all.filter((e) => e.share_estimated).length} Namen nutzen den globalen Positionsfaktor`,
  )

  writeStage('04-merge', { names: all, globalShare })
}

main()
