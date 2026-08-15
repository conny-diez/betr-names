/**
 * Vereinfachtes IPA-Inventar fuer deutsche Namen.
 *
 * Bewusst klein gehalten: die Klang-Engine (PRD 5.1.2) braucht nur
 * Vokal/Konsonant, Zischlaut, Anlaut, Auslaut und Silbenkerne. Feinere
 * Unterscheidungen wuerden die Regeltabelle aufblaehen, ohne einen einzigen
 * Score zu veraendern.
 */

export const MONOPHTHONGS = [
  'a', 'aː', 'ɛ', 'ɛː', 'eː', 'ɪ', 'iː', 'ɔ', 'oː', 'ʊ', 'uː',
  'ʏ', 'yː', 'œ', 'øː', 'ə', 'ɐ',
] as const

export const DIPHTHONGS = ['aɪ', 'aʊ', 'ɔʏ'] as const

export const VOWELS: ReadonlySet<string> = new Set<string>([...MONOPHTHONGS, ...DIPHTHONGS])

/** PRD 5.1.1: "Zischlaute: s, ʃ, z, ts, tʃ" */
export const SIBILANTS: ReadonlySet<string> = new Set(['s', 'ʃ', 'z', 'ts', 'tʃ', 'dʒ', 'ʒ'])

export const PLOSIVES: ReadonlySet<string> = new Set(['p', 'b', 't', 'd', 'k', 'g', 'ts', 'tʃ', 'pf'])

/** Stimmhafte Konsonanten und Liquide/Nasale — "weich" im Sinne der Stil-Achse `softness`. */
export const SONORANTS: ReadonlySet<string> = new Set(['m', 'n', 'ŋ', 'l', 'ʁ', 'j', 'v', 'z'])

export function isVowel(phoneme: string): boolean {
  return VOWELS.has(phoneme)
}

/**
 * Laenge und Diakritika abstreifen. Die Kollisionsregeln in PRD 5.1.2
 * vergleichen Laute, nicht Laengen: "Mia" endet auf [a], "Ahrens" beginnt mit
 * [aː] — fuer das Ohr ist das derselbe Laut, und genau darum geht es.
 */
export function basePhoneme(phoneme: string): string {
  return phoneme.replace(/ː/g, '')
}
