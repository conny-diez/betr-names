import { analyze, initials, normalizeForG2P, splitParts } from '../phonetics'
import { basePhoneme } from '../phonetics/inventory'
import type { StyleVector } from '../types'
import { styleDistance } from '../style/vector'
import type { SoundFlag } from './flags'
import { TUNING } from '../../../config'
import blacklist from '../../../data/curated/initials-blacklist.json' with { type: 'json' }
import rhymeData from '../../../data/curated/rhyme-risks.json' with { type: 'json' }

const BLACKLIST = blacklist.entries as { initials: string; note: string }[]
const RHYME_RISKS = rhymeData.risks as Record<string, string[]>

/**
 * Initialen-Check (PRD 5.1.3). Geprueft wird die Initialenkette des vollen
 * Namens; der laengste Treffer gewinnt, damit "ASS" nicht zusaetzlich als
 * "SS" gemeldet wird.
 */
export function initialsCheck(firstName: string, surname: string): SoundFlag | null {
  const chain = initials(firstName) + initials(surname)
  const hits = BLACKLIST.filter((e) =>
    e.initials.length <= 2 ? chain === e.initials : chain.includes(e.initials),
  ).sort((a, b) => b.initials.length - a.initials.length)
  const hit = hits[0]
  if (!hit) return null
  return {
    code: 'initials_warning',
    kind: 'info',
    label: `Initialen ${chain}`,
    explanation: `Die Initialen ergeben „${hit.initials}"${hit.note ? ` (${hit.note})` : ''}. Fällt spätestens beim ersten Namensschild auf.`,
    delta: 0,
  }
}

/**
 * Genitiv-Probe (PRD 5.1.3). Namen auf s/ß/x/z bekommen einen Apostroph,
 * alle anderen ein -s. Nur Anzeige, kein Score.
 */
export function genitive(firstName: string): string {
  const trimmed = firstName.trim()
  return /[sßxz]$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}s`
}

/** Reim-/Haenselcheck gegen die kuratierte Liste (PRD 5.1.3). */
export function teasingCheck(firstName: string): SoundFlag | null {
  const key = normalizeForG2P(firstName).replace(/[\s'-]/g, '')
  const rhymes = RHYME_RISKS[key]
  if (!rhymes?.length) return null
  return {
    code: 'teasing_risk',
    kind: 'info',
    label: 'Reimt sich',
    explanation: `Reimt sich auf ${rhymes.map((r) => `„${r}"`).join(', ')}. Kinder finden solche Reime zuverlässig.`,
    delta: 0,
  }
}

/**
 * Buchstabier-Score (PRD 5.1.3): Anzahl mehrdeutiger Schreibweisen.
 * Flag ab dem in `config/tuning.json` gesetzten Schwellwert (Default 2).
 */
export function spellingCheck(firstName: string): SoundFlag | null {
  const w = normalizeForG2P(firstName)
  const ambiguities: string[] = []

  if (/c(?![hk])/.test(w) || /k/.test(w)) ambiguities.push('C oder K')
  if (/z/.test(w) || /ts/.test(w)) ambiguities.push('Z oder TS')
  if (/ph/.test(w)) ambiguities.push('PH oder F')
  if (/y/.test(w)) ambiguities.push('Y oder I')
  if (/(aa|ee|oo|ie)/.test(w)) ambiguities.push('Doppelvokal')
  if (/th/.test(w)) ambiguities.push('TH oder T')
  if (/ck/.test(w)) ambiguities.push('CK oder K')
  if (/(ss|ß)/.test(w)) ambiguities.push('SS oder ß')

  if (ambiguities.length < TUNING.sound.spellingFrictionFrom) return null
  return {
    code: 'spelling_friction',
    kind: 'info',
    label: 'Buchstabieren nötig',
    explanation: `${ambiguities.join(', ')} — dieser Name wird ein Leben lang buchstabiert.`,
    delta: 0,
  }
}

/**
 * Geschwister-Check (PRD 5.1.3). Warnt bei zu hoher Aehnlichkeit (gleicher
 * Anlaut + gleiche Silbenzahl) und bei zu grossem Stilbruch.
 */
export function siblingCheck(
  firstName: string,
  siblingNames: string[],
  styleVector?: StyleVector,
  siblingVectors?: Record<string, StyleVector>,
): SoundFlag[] {
  if (!siblingNames.length) return []
  const own = analyze(firstName)
  const flags: SoundFlag[] = []

  const tooSimilar = siblingNames.filter((sib) => {
    const s = analyze(sib)
    return (
      basePhoneme(s.first_phoneme) === basePhoneme(own.first_phoneme) &&
      s.syllables === own.syllables
    )
  })

  if (tooSimilar.length) {
    flags.push({
      code: 'sibling_similar',
      kind: 'info',
      label: 'Nah an Geschwistern',
      explanation: `Gleicher Anlaut und gleiche Silbenzahl wie ${tooSimilar.map((n) => `„${n}"`).join(', ')}. Im Alltag werden die beiden Namen regelmäßig verwechselt.`,
      delta: 0,
    })
  }

  if (styleVector && siblingVectors) {
    const breaks = siblingNames.filter((sib) => {
      const v = siblingVectors[sib]
      return v && styleDistance(styleVector, v) > TUNING.sound.siblingStyleBreakDistance
    })
    if (breaks.length) {
      flags.push({
        code: 'sibling_style_break',
        kind: 'info',
        label: 'Anderer Stil als Geschwister',
        explanation: `Stilistisch deutlich entfernt von ${breaks.map((n) => `„${n}"`).join(', ')}. Muss kein Problem sein — nur bewusst entscheiden.`,
        delta: 0,
      })
    }
  }

  return flags
}

/** Spitznamen-Fallback fuer Namen ohne Eintrag im kuratierten Mapping. */
export function hasMultipleParts(name: string): boolean {
  return splitParts(name).length > 1
}
