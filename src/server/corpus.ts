import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusName, NameCandidate } from '@/lib/types'

/**
 * Der Korpus wird einmal beim Start gelesen und im Speicher gehalten.
 *
 * PRD 9: "Der Namenskorpus wird nicht zur Laufzeit abgefragt, sondern einmalig
 * gebaut. […] zur Laufzeit finden nur noch lokale Vektor- und
 * Score-Berechnungen statt." 3.000 Namen sind wenige Megabyte — jede Form von
 * Datenbankabfrage wäre hier langsamer als der Zugriff auf ein Array.
 */

interface CorpusFile {
  version: number
  built_at: string
  distribution_safe: boolean
  count: number
  names: CorpusName[]
}

let cache: {
  file: CorpusFile
  candidates: NameCandidate[]
  byRef: Map<string, NameCandidate>
  calibration: NameCandidate[]
} | null = null

export function corpusRef(id: string): string {
  return `corpus:${id}`
}

export function customRef(id: string): string {
  return `custom:${id}`
}

function toCandidate(name: CorpusName): NameCandidate {
  return {
    ref: corpusRef(name.id),
    name: name.name,
    gender: name.gender,
    origin: name.origin,
    meaning: name.meaning,
    syllables: name.syllables,
    stress_pattern: name.stress_pattern,
    first_phoneme: name.first_phoneme,
    last_phoneme: name.last_phoneme,
    ends_with_vowel: name.ends_with_vowel,
    starts_with_vowel: name.starts_with_vowel,
    sibilant_count: name.sibilant_count,
    phoneme_string: name.phoneme_string,
    style_vector: name.style_vector,
    frequency_by_year: name.frequency_by_year,
    nicknames: name.nicknames,
    rhyme_risks: name.rhyme_risks,
    variants: name.variants,
  }
}

function load() {
  if (cache) return cache
  const path = join(process.cwd(), 'data', 'corpus', 'names.json')
  let file: CorpusFile
  try {
    file = JSON.parse(readFileSync(path, 'utf8')) as CorpusFile
  } catch {
    throw new Error(
      'Korpus fehlt. Erst `npm run corpus:build` ausführen (siehe README, Abschnitt Korpus).',
    )
  }
  const candidates = file.names.map(toCandidate)
  cache = {
    file,
    candidates,
    byRef: new Map(candidates.map((c) => [c.ref, c])),
    calibration: file.names
      .filter((n) => n.is_calibration_name)
      .map(toCandidate),
  }
  return cache
}

export function allCandidates(): NameCandidate[] {
  return load().candidates
}

export function candidateByRef(ref: string): NameCandidate | undefined {
  return load().byRef.get(ref)
}

/**
 * Das feste Kalibrierungs-Set (PRD 5.2.2 / 9.7).
 *
 * Die Reihenfolge ist stabil, aber nicht nach Achsen sortiert — sonst kämen
 * erst vier klassische, dann vier moderne Namen, und die Person würde das
 * Muster erkennen statt zu bewerten.
 */
export function calibrationSet(): NameCandidate[] {
  const set = load().calibration
  return interleaveDeterministic(set)
}

function interleaveDeterministic(names: NameCandidate[]): NameCandidate[] {
  const sorted = [...names].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const out: NameCandidate[] = []
  // Feste Umsortierung: erst jeder dritte, dann der Rest. Reproduzierbar und
  // gut genug, um Blockbildung nach Stil zu vermeiden.
  for (const offset of [0, 1, 2]) {
    for (let i = offset; i < sorted.length; i += 3) out.push(sorted[i])
  }
  return out
}

export function corpusMeta(): { count: number; builtAt: string; distributionSafe: boolean } {
  const { file } = load()
  return { count: file.count, builtAt: file.built_at, distributionSafe: file.distribution_safe }
}
