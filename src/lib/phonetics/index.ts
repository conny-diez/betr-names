import type { Phonetics } from '../types'
import { normalizeForG2P, splitParts, toPhonemes, partToPhonemes } from './g2p'
import { rime, stressPattern, syllabify, type Syllable } from './syllables'
import { SIBILANTS, basePhoneme, isVowel } from './inventory'
import overrides from '../../../data/curated/stress-overrides.json' with { type: 'json' }

const STRESS_OVERRIDES = overrides as Record<string, string>

export interface PhoneticAnalysis extends Phonetics {
  syllableList: Syllable[]
  phonemes: string[]
  /** Reim der letzten Silbe — Basis der Endreim-Regel (PRD 5.1.2). */
  lastRime: string
}

/**
 * Vollstaendige Phonetik-Analyse eines Namens (PRD 5.1.1).
 *
 * Wird sowohl in der Build-Pipeline (Schritt 5, `phonemize`) als auch zur
 * Laufzeit fuer nutzereingegebene Nachnamen und eigene Namen (F4) benutzt.
 */
export function analyze(name: string): PhoneticAnalysis {
  const parts = splitParts(name)

  const perPart = parts.map((part) => {
    const phonemes = partToPhonemes(part)
    const syllables = syllabify(phonemes)
    const override = STRESS_OVERRIDES[part]
    return { part, phonemes, syllables, stress: stressPattern(syllables, override) }
  })

  const phonemes = perPart.flatMap((p) => p.phonemes)
  const syllableList = perPart.flatMap((p) => p.syllables)
  const stress = perPart.map((p) => p.stress).join('')

  const first = phonemes[0] ?? ''
  const last = phonemes[phonemes.length - 1] ?? ''

  return {
    syllables: syllableList.length,
    stress_pattern: stress,
    first_phoneme: first,
    last_phoneme: last,
    starts_with_vowel: isVowel(first),
    ends_with_vowel: isVowel(last),
    sibilant_count: phonemes.filter((p) => SIBILANTS.has(p)).length,
    phoneme_string: phonemes.join(''),
    syllableList,
    phonemes,
    lastRime: syllableList.length ? rime(syllableList[syllableList.length - 1]) : '',
  }
}

/** Nur die im Korpus gespeicherten Felder (PRD Kapitel 8). */
export function phoneticFields(name: string): Phonetics {
  const { syllableList: _s, phonemes: _p, lastRime: _r, ...fields } = analyze(name)
  return fields
}

/** Initialen aller Namensteile — Grundlage des Initialen-Checks (PRD 5.1.3). */
export function initials(name: string): string {
  return splitParts(name)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export { normalizeForG2P, splitParts, toPhonemes, syllabify, rime, basePhoneme, isVowel }
export type { Syllable }
