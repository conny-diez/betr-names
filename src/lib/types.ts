/** Gemeinsame Typen fuer Korpus, Engines und App. Referenz: PRD Kapitel 8. */

/** PRD 5.1.1 — pro Name vorberechnete Phonetik-Attribute. */
export interface Phonetics {
  /** Silbenzahl */
  syllables: number
  /** Betonungsmuster, z. B. "10" (Trochaeus), "01" (Jambus), "100" (Daktylus) */
  stress_pattern: string
  /** Anlaut in vereinfachter IPA-Notation */
  first_phoneme: string
  /** Auslaut in vereinfachter IPA-Notation */
  last_phoneme: string
  ends_with_vowel: boolean
  starts_with_vowel: boolean
  /** Zischlaute: s, ʃ, z, ts, tʃ */
  sibilant_count: number
  /** vollstaendige vereinfachte Lautschrift */
  phoneme_string: string
}

/** PRD 5.2.1 — die fuenf Stilachsen, alle in [0,1]. */
export interface StyleVector {
  /** 0 = klassisch/traditionell, 1 = modern/neu */
  era: number
  /** 0 = hart/konsonantisch, 1 = weich/vokalisch */
  softness: number
  /** 0 = regional/deutsch verankert, 1 = international/mehrsprachig */
  reach: number
  /** 0 = haeufig (Top 100), 1 = selten */
  frequency: number
  /** 0 = eindeutig geschlechtszugeordnet, 1 = ambig/neutral */
  ambiguity: number
}

export const STYLE_AXES = ['era', 'softness', 'reach', 'frequency', 'ambiguity'] as const
export type StyleAxis = (typeof STYLE_AXES)[number]

export type Gender = 'm' | 'f' | 'neutral'
export type GenderPreference = 'male' | 'female' | 'open'

/** Herkunftsnachweis pro Feld — PRD 9.1, bindende Anweisung 1. */
export interface Provenance {
  source_id: string
  license: string
}

/** Ein Eintrag im Grundkorpus. PRD Kapitel 8, Entity `Name`. */
export interface CorpusName extends Phonetics {
  id: string
  name: string
  gender: Gender
  origin: string | null
  meaning: string | null
  style_vector: StyleVector
  /** { "2015": 412, ... } — absolute Zaehlungen, nur Erstnamen (PRD 9.3.2) */
  frequency_by_year: Record<string, number>
  nicknames: string[]
  rhyme_risks: string[]
  is_calibration_name: boolean
  /** Schreibvarianten desselben Namens, bleiben sichtbar (PRD 9.3 Schluss) */
  variants: string[]
  /** Feldweise Provenienz, gefiltert von DISTRIBUTION_SAFE (PRD 9.1) */
  provenance: Record<string, Provenance>
}

/** Vom Nutzer hinzugefuegter Name. PRD F4 / Kapitel 8, Entity `CustomName`. */
export interface CustomName extends Phonetics {
  id: string
  couple_id: string
  added_by_parent_id: string
  name: string
  gender: Gender
  style_vector: StyleVector
  nicknames: string[]
}

/** Was Deck, Matches und Detail-Sheet gemeinsam brauchen. */
export interface NameCandidate extends Phonetics {
  /** "corpus:<id>" oder "custom:<id>" — die name_ref aus Kapitel 8 */
  ref: string
  name: string
  gender: Gender
  origin: string | null
  meaning: string | null
  style_vector: StyleVector
  frequency_by_year: Record<string, number>
  nicknames: string[]
  rhyme_risks: string[]
  variants: string[]
}

export type RatingValue = 'love' | 'like' | 'pass' | 'veto'

/** PRD 5.3.3 — optionale Grund-Tags, privat. */
export const REASON_TAGS = [
  'erinnert mich an jemanden',
  'zu häufig',
  'zu ausgefallen',
  'Klang passt nicht',
  'Schreibweise',
  'weiß nicht, einfach nein',
] as const
export type ReasonTag = (typeof REASON_TAGS)[number]

/** Der einzige Grund, der — mit Zustimmung — geteilt werden darf (PRD 5.3.3). */
export const SHAREABLE_REASON: ReasonTag = 'erinnert mich an jemanden'

export type TrialVerdict = 'better' | 'same' | 'worse'
