/**
 * Schritt 3 — normalize: Erstnamen isolieren, Schreibvarianten mappen.
 *
 * PRD 9.3.2 (Positionsproblem): "nur Erstnamen (position = 1) verwenden, wo die
 * Spalte existiert; Quellen ohne Positionsangabe bekommen einen Korrekturfaktor
 * oder werden nur für die Namensliste, nicht für die Häufigkeit genutzt."
 *
 * PRD 9.3 (Schluss): Schreibvarianten zusammenführen, aber als Varianten
 * sichtbar halten.
 */
import { log, nameKey, readStage, step, writeStage } from './lib.ts'
import type { CleanRow } from './02-clean.ts'
import variantsFile from '../data/curated/spelling-variants.json' with { type: 'json' }

export interface NormalizedRow extends CleanRow {
  /** Kanonische Schreibweise nach Variantenmapping */
  canonical: string
  /** Ist das gesichert ein Erstname? */
  isFirstName: boolean
  /** Fehlt der Quelle die Positionsspalte? Dann wird die Häufigkeit geschätzt. */
  positionUnknown: boolean
}

const groups = variantsFile.groups as Record<string, string[]>

/** Variante → kanonische Form. */
export const VARIANT_TO_CANONICAL: Map<string, string> = new Map()
for (const [canonical, variants] of Object.entries(groups)) {
  for (const variant of variants) VARIANT_TO_CANONICAL.set(nameKey(variant), canonical)
}

export function canonicalName(name: string): string {
  const mapped = VARIANT_TO_CANONICAL.get(nameKey(name))
  if (!mapped) return name
  // Kanonische Form in der Schreibweise der Tabelle, aber mit Großbuchstaben
  return mapped.charAt(0).toUpperCase() + mapped.slice(1)
}

function main(): void {
  step('3 normalize')
  const { rows } = readStage<{ rows: CleanRow[] }>('02-clean')

  const out: NormalizedRow[] = rows.map((row) => ({
    ...row,
    canonical: canonicalName(row.name),
    isFirstName: row.position === 1,
    positionUnknown: row.position === null,
  }))

  const withPosition = out.filter((r) => !r.positionUnknown)
  const firstNames = out.filter((r) => r.isFirstName)
  const remapped = out.filter((r) => r.canonical !== r.name)

  log(`${withPosition.length} Zeilen mit Positionsangabe, davon ${firstNames.length} Erstnamen`)
  log(`${out.length - withPosition.length} Zeilen ohne Positionsangabe (Berlin vor 2017, rare_names)`)
  log(`${remapped.length} Zeilen auf eine kanonische Schreibweise abgebildet`)

  writeStage('03-normalize', { rows: out })
}

// Nur ausführen, wenn direkt aufgerufen — Tests importieren die Filterfunktionen.
if (import.meta.url === `file://${process.argv[1]}`) main()
