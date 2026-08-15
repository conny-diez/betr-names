/**
 * Schritt 7 — vectorize: Stilvektoren regelbasiert, danach kuratierte Overrides.
 *
 * PRD 9.6: Die vier nicht-statistischen Achsen werden **im Build** gesetzt und
 * als Zahlen eingefroren. Niemals ein LLM-Aufruf zur Laufzeit.
 *
 * Umsetzung je Achse:
 * - `frequency`  aus den Häufigkeitsdaten (Perzentil), wie im PRD gefordert
 * - `era`        aus der Verteilung über die Jahre (Schwerpunktjahr)
 * - `ambiguity`  aus der Geschlechterverteilung der Statistikdaten
 * - `reach`      aus Wikidata-Sprachversionen plus orthografischem Ersatzsignal
 * - `softness`   regelbasiert über Vokalanteil, Plosiv- und Sonorantenanteil
 *
 * Abweichung vom PRD, bewusst und dokumentiert: `softness` sollte laut 9.6
 * LLM-annotiert werden. Dieser Build hat keinen Modellzugriff, deshalb greift
 * die im PRD ebenfalls genannte regelbasierte Variante. Die Schnittstelle dafür
 * ist `data/curated/style-overrides.json` — eine LLM-Annotation kann dort
 * eingespielt werden, ohne dass sich am Rest etwas ändert.
 */
import { PLOSIVES, SIBILANTS, SONORANTS, VOWELS } from '../src/lib/phonetics/inventory.ts'
import { toPhonemes } from '../src/lib/phonetics/g2p.ts'
import { clamp01 } from '../src/lib/style/vector.ts'
import type { StyleVector } from '../src/lib/types.ts'
import { TUNING } from '../config/index.ts'
import { log, nameKey, readStage, step, warn, writeStage } from './lib.ts'
import type { EnrichedName } from './06-enrich.ts'
import calibrationFile from '../data/curated/calibration-set.json' with { type: 'json' }
import overridesFile from '../data/curated/style-overrides.json' with { type: 'json' }

const CALIBRATION = calibrationFile.names as {
  name: string
  gender: string
  style_vector: StyleVector
}[]
const OVERRIDES = overridesFile.overrides as Record<string, Partial<StyleVector>>

/** Pseudobeobachtungen für die Schrumpfung der Achse `era` zur Mitte. */
const ERA_SHRINK_PRIOR = 60
/** Ab wie vielen Wikipedia-Sprachversionen das Wikidata-Signal verwendet wird. */
const MIN_SITELINKS = 3

/** Stärkeres orthografisches Signal, verwendet in `orthographicReach`. */
const GERMAN_ENDINGS =
  /(ke|je|tje|hild|traud|gunde|bert|wig|hard|fried|helm|rich|old|mund|burg|linde|run)$/

export interface VectorizedName extends EnrichedName {
  gender: 'm' | 'f' | 'neutral'
  style_vector: StyleVector
  is_calibration_name: boolean
  /** Welche Achsen wurden von Hand gesetzt? Für die Nachvollziehbarkeit. */
  overridden_axes: string[]
}

/** Achse `softness`: 0 = hart/konsonantisch, 1 = weich/vokalisch. */
export function softnessOf(name: string): number {
  const phonemes = toPhonemes(name)
  if (!phonemes.length) return 0.5
  const vowels = phonemes.filter((p) => VOWELS.has(p))
  const consonants = phonemes.filter((p) => !VOWELS.has(p))
  const vowelShare = vowels.length / phonemes.length
  const plosiveShare = consonants.length
    ? consonants.filter((p) => PLOSIVES.has(p)).length / consonants.length
    : 0
  const sonorantShare = consonants.length
    ? consonants.filter((p) => SONORANTS.has(p)).length / consonants.length
    : 0
  const sibilantShare = phonemes.filter((p) => SIBILANTS.has(p)).length / phonemes.length
  const endsWithVowel = VOWELS.has(phonemes[phonemes.length - 1])

  return clamp01(
    0.5 +
      0.3 * (sonorantShare - plosiveShare) +
      0.5 * (vowelShare - 0.48) +
      0.06 * (endsWithVowel ? 1 : -1) -
      0.35 * sibilantShare,
  )
}

/**
 * Achse `reach` ohne Wikidata: orthografische Hinweise darauf, ob ein Name im
 * deutschen Sprachraum verwurzelt ist.
 *
 * Bewusst asymmetrisch: die Regeln erkennen deutsche Verankerung recht sicher
 * (Endungen wie -hild, -bert, -wig gibt es nirgends sonst), internationale
 * Verbreitung dagegen nur schwach. Ein früherer Versuch, Umlaute als „deutsch"
 * zu werten, stufte „Ömer" und „Zeynep" als regional deutsch ein — die Regel
 * ist wieder draußen. Wo Wikidata etwas weiß, hat Wikidata Vorrang.
 */
export function orthographicReach(name: string): number {
  const w = name.toLowerCase()
  let score = 0.5
  // deutsch verankert
  if (GERMAN_ENDINGS.test(w)) score -= 0.25
  if (/(sch|pf|tz)/.test(w)) score -= 0.12
  if (/^(hei|wie|frie|thi|jo(ch|st)|ger|wil)/.test(w)) score -= 0.1
  // international
  if (/[xq]/.test(w)) score += 0.12
  if (/c(?![hk])/.test(w)) score += 0.12
  if (/(ah|ia|io|eo|ov|ev)$/.test(w)) score += 0.08
  if (/(ph|th)/.test(w)) score += 0.06
  return clamp01(score)
}

function main(): void {
  step('7 vectorize')
  const { names } = readStage<{ names: EnrichedName[] }>('06-enrich')

  // --- frequency: Perzentil innerhalb des Auslieferungskorpus ---------------
  //
  // Wichtig: das Perzentil wird über die Namen berechnet, die tatsächlich
  // ausgeliefert werden, nicht über alle 9.000 Rohnamen. Sonst läge der ganze
  // Korpus im Band 0–0.35 („alles häufig"), weil die 6.000 Einzelnennungen aus
  // dem Rohbestand die Skala nach oben wegziehen — und die Achse wäre tot.
  const shipped = [...names].sort((a, b) => b.total - a.total).slice(0, TUNING.corpus.targetSize)
  const shippedKeys = new Set(shipped.map((n) => nameKey(n.name)))
  const sortedTotals = shipped.map((n) => n.total).sort((a, b) => a - b)
  log(
    `Auslieferungskorpus: ${shipped.length} Namen, Häufigkeit ${Math.round(sortedTotals[0])}–${Math.round(sortedTotals[sortedTotals.length - 1])}`,
  )
  const percentileOf = (value: number): number => {
    let lo = 0
    let hi = sortedTotals.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sortedTotals[mid] < value) lo = mid + 1
      else hi = mid
    }
    return lo / Math.max(1, sortedTotals.length - 1)
  }

  // --- era: Schwerpunktjahr der Nennungen ----------------------------------
  const yearTotals = new Map<string, number>()
  for (const n of names) {
    for (const [year, count] of Object.entries(n.frequency_by_year)) {
      yearTotals.set(year, (yearTotals.get(year) ?? 0) + count)
    }
  }
  const years = [...yearTotals.keys()].map(Number).sort((a, b) => a - b)
  const minYear = years[0]
  const maxYear = years[years.length - 1]
  log(`Datenfenster für die Achse era: ${minYear}–${maxYear}`)

  // --- reach: Wikidata-Signal auf Perzentil bringen -------------------------
  const sitelinkValues = names
    .map((n) => n.wikidata_sitelinks)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b)
  const sitelinkPercentile = (value: number): number => {
    if (!sitelinkValues.length) return 0.5
    let lo = 0
    let hi = sitelinkValues.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sitelinkValues[mid] < value) lo = mid + 1
      else hi = mid
    }
    return lo / Math.max(1, sitelinkValues.length - 1)
  }

  const calibrationByKey = new Map(CALIBRATION.map((c) => [nameKey(c.name), c]))
  const seenCalibration = new Set<string>()

  const out: VectorizedName[] = names.map((entry) => {
    const key = nameKey(entry.name)

    // frequency: 0 = häufig, 1 = selten. Namen unterhalb des Korpusschnitts
    // bekommen 1 — sie werden in Schritt 9 ohnehin nicht ausgeliefert.
    const frequency = shippedKeys.has(key) ? clamp01(1 - percentileOf(entry.total)) : 1

    // era: gewichtetes Mittel der Jahre, in denen der Name vergeben wurde
    let weightedYear = 0
    let weightSum = 0
    for (const [year, count] of Object.entries(entry.frequency_by_year)) {
      // Anteil am Jahrgang statt absoluter Zahl — sonst schlägt die
      // Gesamtgeburtenzahl des Jahres durch.
      const share = count / (yearTotals.get(year) ?? 1)
      weightedYear += Number(year) * share
      weightSum += share
    }
    const centroid = weightSum > 0 ? weightedYear / weightSum : (minYear + maxYear) / 2
    const eraRaw = (centroid - minYear) / Math.max(1, maxYear - minYear)
    // Spreizen: das 12-Jahres-Fenster erzeugt sonst nur Werte um 0.5.
    const eraSpread = eraRaw
    // Schrumpfen zur Mitte, je dünner die Datenlage. Ein Name mit fünf
    // Nennungen in einem einzigen Jahr ist kein Epochensignal, sondern Rauschen
    // — ohne diese Korrektur landen tausende Einzelfälle auf exakt 0 oder 1.
    const era = clamp01(0.5 + (eraSpread - 0.5) * 3 * (entry.total / (entry.total + ERA_SHRINK_PRIOR)))

    // ambiguity: 0 = eindeutig, 1 = ambig
    const total = entry.genderCounts.m + entry.genderCounts.w
    const ambiguity =
      total > 0 ? clamp01(1 - Math.abs(entry.genderCounts.m - entry.genderCounts.w) / total) : 0.5

    // reach — Wikidata nur nutzen, wenn das Signal überhaupt trägt. Unter drei
    // Sprachversionen ist nicht unterscheidbar, ob ein Name regional ist oder
    // ob Wikidata ihn schlicht nicht kennt.
    const ortho = orthographicReach(entry.name)
    const reach =
      entry.wikidata_sitelinks !== null && entry.wikidata_sitelinks >= MIN_SITELINKS
        ? clamp01(0.7 * sitelinkPercentile(entry.wikidata_sitelinks) + 0.3 * ortho)
        : clamp01(ortho - 0.05)

    const softness = softnessOf(entry.name)

    let vector: StyleVector = { era, softness, reach, frequency, ambiguity }
    const overridden: string[] = []

    // Kalibrierungsset: die vier nicht-statistischen Achsen kommen aus der
    // Handkuratierung (PRD 9.7), `frequency` bleibt datengetrieben (PRD 5.2.1).
    const calibration = calibrationByKey.get(key)
    if (calibration) {
      seenCalibration.add(key)
      vector = {
        era: calibration.style_vector.era,
        softness: calibration.style_vector.softness,
        reach: calibration.style_vector.reach,
        ambiguity: calibration.style_vector.ambiguity,
        frequency,
      }
      overridden.push('era', 'softness', 'reach', 'ambiguity')
    }

    // Manuelle Prüfung der Top 200 (PRD 9.6)
    const manual = OVERRIDES[key]
    if (manual) {
      for (const [axis, value] of Object.entries(manual)) {
        if (typeof value !== 'number') continue
        vector[axis as keyof StyleVector] = clamp01(value)
        if (!overridden.includes(axis)) overridden.push(axis)
      }
    }

    const gender: 'm' | 'f' | 'neutral' =
      ambiguity >= 0.5
        ? 'neutral'
        : entry.genderCounts.m >= entry.genderCounts.w
          ? 'm'
          : 'f'

    return {
      ...entry,
      gender,
      style_vector: vector,
      is_calibration_name: calibration !== undefined,
      overridden_axes: overridden,
    }
  })

  const missingCalibration = CALIBRATION.filter((c) => !seenCalibration.has(nameKey(c.name)))
  if (missingCalibration.length) {
    warn(
      `Kalibrierungsnamen ohne Korpustreffer: ${missingCalibration.map((c) => c.name).join(', ')} — werden in Schritt 9 synthetisch ergänzt`,
    )
  }

  const stats = (axis: keyof StyleVector) => {
    const values = out.map((n) => n.style_vector[axis])
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
    return `${axis}: ø${mean.toFixed(2)} σ${sd.toFixed(2)}`
  }
  log(['era', 'softness', 'reach', 'frequency', 'ambiguity'].map((a) => stats(a as keyof StyleVector)).join('  '))
  log(`${out.filter((n) => n.gender === 'neutral').length} Namen als geschlechtsneutral eingestuft`)

  writeStage('07-vectorize', { names: out })
}

main()
