/**
 * Schritt 8 — validate: Testfälle aus PRD 13, Vollständigkeitsprüfung aller Felder.
 *
 * Dieser Schritt darf den Build abbrechen. Ein Korpus mit stillen Lücken ist
 * schlimmer als kein Korpus: die Fehler tauchen erst im Deck auf, als Namen,
 * die sich seltsam anfühlen, ohne dass jemand sagen kann warum.
 */
import { TUNING } from '../config/index.ts'
import { phoneticFields } from '../src/lib/phonetics/index.ts'
import { soundScore } from '../src/lib/sound/index.ts'
import { STYLE_AXES } from '../src/lib/types.ts'
import { fail, log, nameKey, readStage, step, warn, writeStage } from './lib.ts'
import type { VectorizedName } from './07-vectorize.ts'
import calibrationFile from '../data/curated/calibration-set.json' with { type: 'json' }

interface Check {
  name: string
  ok: boolean
  detail: string
}

/** Die Klang-Testfälle aus PRD Kapitel 13. */
function soundCases(): Check[] {
  const checks: Check[] = []

  const mia = soundScore('Mia', 'Ahrens')
  checks.push({
    name: 'Mia Ahrens → vowel_clash, Score < 50, rote Ampel',
    ok: mia.flags.some((f) => f.code === 'vowel_clash') && mia.score < 50 && mia.light === 'red',
    detail: `Score ${mia.score}, ${mia.light}, Flags: ${mia.flags.map((f) => f.code).join(',')}`,
  })

  const lars = soundScore('Lars', 'Schulz')
  checks.push({
    name: 'Lars Schulz → sibilant_overload, gelbe Ampel',
    ok: lars.flags.some((f) => f.code === 'sibilant_overload') && lars.light === 'yellow',
    detail: `Score ${lars.score}, ${lars.light}, Flags: ${lars.flags.map((f) => f.code).join(',')}`,
  })

  const maxi = soundScore('Maximilian', 'Kim')
  checks.push({
    name: 'Maximilian Kim → rhythm_good + balance_good, Score > 85',
    ok:
      maxi.flags.some((f) => f.code === 'rhythm_good') &&
      maxi.flags.some((f) => f.code === 'balance_good') &&
      maxi.score > 85,
    detail: `Score ${maxi.score}, Flags: ${maxi.flags.map((f) => f.code).join(',')}`,
  })

  const ass = soundScore('Anna-Sophie', 'Sommer')
  checks.push({
    name: 'Anna-Sophie Sommer → initials_warning (A.S.S.)',
    ok: ass.flags.some((f) => f.code === 'initials_warning'),
    detail: `Flags: ${ass.flags.map((f) => f.code).join(',')}`,
  })

  return checks
}

function main(): void {
  step('8 validate')
  const { names } = readStage<{ names: VectorizedName[] }>('07-vectorize')
  const shipped = [...names].sort((a, b) => b.total - a.total).slice(0, TUNING.corpus.targetSize)

  const checks: Check[] = [...soundCases()]

  // --- Vollständigkeit aller Felder ---------------------------------------
  const incomplete = shipped.filter(
    (n) =>
      !n.name ||
      n.syllables < 1 ||
      !n.phoneme_string ||
      !n.stress_pattern ||
      n.stress_pattern.length !== n.syllables ||
      !n.first_phoneme ||
      !n.last_phoneme ||
      Object.keys(n.frequency_by_year).length === 0 ||
      STYLE_AXES.some((axis) => {
        const v = n.style_vector[axis]
        return typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1
      }),
  )
  checks.push({
    name: 'Alle Pflichtfelder gesetzt und im gültigen Bereich',
    ok: incomplete.length === 0,
    detail:
      incomplete.length === 0
        ? `${shipped.length} Namen vollständig`
        : `${incomplete.length} unvollständig: ${incomplete.slice(0, 8).map((n) => n.name).join(', ')}`,
  })

  // --- Phonetik reproduzierbar --------------------------------------------
  // Die gespeicherten Werte müssen exakt das ergeben, was die Laufzeit-Engine
  // aus demselben Namen ableitet. Sonst bewerten Korpus und Eingabemaske
  // unterschiedlich, und niemand merkt es.
  const drifted = shipped.filter((n) => {
    const fresh = phoneticFields(n.name)
    return (
      fresh.syllables !== n.syllables ||
      fresh.phoneme_string !== n.phoneme_string ||
      fresh.stress_pattern !== n.stress_pattern ||
      fresh.sibilant_count !== n.sibilant_count
    )
  })
  checks.push({
    name: 'Gespeicherte Phonetik stimmt mit der Laufzeit-Engine überein',
    ok: drifted.length === 0,
    detail: drifted.length === 0 ? 'keine Abweichung' : `${drifted.length} Abweichungen`,
  })

  // --- Keine Nicht-Namen ---------------------------------------------------
  const suspicious = shipped.filter((n) => !/^[\p{L}][\p{L}\p{M}'\- ]*$/u.test(n.name))
  checks.push({
    name: 'Keine Nicht-Namen im Korpus (PRD 13)',
    ok: suspicious.length === 0,
    detail: suspicious.length === 0 ? 'sauber' : suspicious.map((n) => n.name).join(', '),
  })

  // --- Häufigkeiten nur aus Erstnamen -------------------------------------
  const { globalShare } = readStage<{ globalShare: number }>('04-merge')
  checks.push({
    name: 'Häufigkeiten auf Erstnamen reduziert (PRD 9.3.2)',
    ok: globalShare > 0 && globalShare < 1,
    detail: `globaler Erstnamen-Anteil ${(globalShare * 100).toFixed(1)} % — Positionsfaktor aktiv`,
  })

  // --- Kalibrierungsset ----------------------------------------------------
  const calibrationNames = calibrationFile.names.map((c) => nameKey(c.name))
  const present = shipped.filter((n) => calibrationNames.includes(nameKey(n.name)))
  const missing = calibrationNames.filter(
    (k) => !shipped.some((n) => nameKey(n.name) === k),
  )
  checks.push({
    name: 'Kalibrierungsnamen im Auslieferungskorpus',
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `${present.length}/${calibrationNames.length} vorhanden`
        : `fehlen: ${missing.join(', ')} — Schritt 9 ergänzt sie synthetisch`,
  })

  // Streuung des Kalibrierungssets: PRD 9.7 verlangt je Achse mindestens zwei
  // Namen nahe 0 und zwei nahe 1. Für `frequency` gilt das erst nach dem
  // Datenabgleich in Schritt 7 — deshalb wird es hier geprüft, nicht kuratiert.
  const calibrationVectors = calibrationFile.names.map((c) => {
    const hit = shipped.find((n) => nameKey(n.name) === nameKey(c.name))
    return { name: c.name, vector: hit ? hit.style_vector : c.style_vector }
  })
  for (const axis of STYLE_AXES) {
    const values = calibrationVectors.map((c) => c.vector[axis])
    const low = values.filter((v) => v <= 0.3).length
    const high = values.filter((v) => v >= 0.7).length
    checks.push({
      name: `Kalibrierungsset spannt die Achse "${axis}" auf`,
      ok: low >= 2 && high >= 2,
      detail: `${low} Namen ≤ 0.3, ${high} Namen ≥ 0.7`,
    })
  }

  // --- Korpusumfang --------------------------------------------------------
  checks.push({
    name: `Zielumfang ${TUNING.corpus.targetSize} Namen erreicht (PRD 9.8)`,
    ok: shipped.length >= TUNING.corpus.targetSize,
    detail: `${shipped.length} Namen`,
  })

  // --- Ausgabe -------------------------------------------------------------
  let failed = 0
  for (const check of checks) {
    if (check.ok) log(`\x1b[32m✓\x1b[0m ${check.name} — ${check.detail}`)
    else {
      failed++
      warn(`✗ ${check.name} — ${check.detail}`)
    }
  }

  writeStage('08-validate', { checks, failed })

  // Fehlende Kalibrierungsnamen und Achsenstreuung sind Warnungen, keine
  // Abbruchgründe — Schritt 9 kann sie auffangen. Alles andere bricht ab.
  const fatal = checks.filter(
    (c) => !c.ok && !c.name.startsWith('Kalibrierungs'),
  )
  if (fatal.length) fail(`${fatal.length} Prüfung(en) fehlgeschlagen`)
  if (failed) warn(`${failed} Warnung(en) — Build läuft weiter`)
}

main()
