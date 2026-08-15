import { analyze, type PhoneticAnalysis } from '../phonetics'
import { basePhoneme } from '../phonetics/inventory'
import type { StyleVector } from '../types'
import { TUNING } from '../../../config'
import type { Light, SoundFlag } from './flags'
import { genitive, initialsCheck, siblingCheck, spellingCheck, teasingCheck } from './checks'

export interface SoundResult {
  /** 0–100, geklemmt (PRD 5.1.2) */
  score: number
  /** grün ≥ 75, gelb 50–74, rot < 50 */
  light: Light
  flags: SoundFlag[]
  /** "{Vorname} {Nachname}" — die einzige Form, in der ein Name gezeigt wird (PRD 4.3) */
  fullName: string
  /** Genitiv-Probe (PRD 5.1.3) */
  genitive: string
}

export interface SoundOptions {
  siblingNames?: string[]
  styleVector?: StyleVector
  siblingVectors?: Record<string, StyleVector>
}

const cache = new Map<string, PhoneticAnalysis>()

function cachedAnalyze(name: string): PhoneticAnalysis {
  const hit = cache.get(name)
  if (hit) return hit
  const value = analyze(name)
  if (cache.size > 5000) cache.clear()
  cache.set(name, value)
  return value
}

function flag(
  code: SoundFlag['code'],
  kind: SoundFlag['kind'],
  label: string,
  explanation: string,
  delta: number,
): SoundFlag {
  return { code, kind, label, explanation, delta }
}

/**
 * Klang-Score einer Kombination aus Vorname und Nachname (PRD 5.1.2).
 *
 * Start bei 100, Abzuege und Boni laut Tabelle, Ergebnis auf 0–100 geklemmt.
 * **Rot ist nie ein Ausschluss** (PRD 5.1.2) — die Funktion filtert nichts,
 * sie erklaert nur.
 */
export function soundScore(firstName: string, surname: string, opts: SoundOptions = {}): SoundResult {
  const first = cachedAnalyze(firstName)
  const last = cachedAnalyze(surname)
  const flags: SoundFlag[] = []

  const combined = `${firstName} ${surname}`

  // --- Abzuege -----------------------------------------------------------
  if (first.ends_with_vowel && last.starts_with_vowel) {
    const merged = (firstName + surname).replace(/\s+/g, '')
    flags.push(
      flag(
        'vowel_clash',
        'penalty',
        'Vokale stoßen zusammen',
        `Zwei Vokale treffen aufeinander — beim Sprechen verschmilzt das zu „${merged}".`,
        -25,
      ),
    )
  }

  if (
    first.last_phoneme &&
    basePhoneme(first.last_phoneme) === basePhoneme(last.first_phoneme)
  ) {
    flags.push(
      flag(
        'consonant_clash',
        'penalty',
        'Gleicher Laut trifft auf sich selbst',
        `„${firstName}" endet auf denselben Laut, mit dem „${surname}" beginnt. Gesprochen bleibt davon meist nur einer übrig.`,
        -20,
      ),
    )
  }

  const sibilants = first.sibilant_count + last.sibilant_count
  if (sibilants >= 3) {
    flags.push(
      flag(
        'sibilant_overload',
        'penalty',
        'Viele Zischlaute',
        `${sibilants} Zischlaute in einem Namen. Beim Rufen über den Spielplatz zischt das.`,
        -15,
      ),
    )
  }

  if (first.syllables === last.syllables && first.stress_pattern === last.stress_pattern) {
    flags.push(
      flag(
        'rhythm_flat',
        'penalty',
        'Gleichmaß',
        `Beide Teile haben ${first.syllables} Silbe${first.syllables === 1 ? '' : 'n'} mit derselben Betonung. Der Name tickt wie ein Metronom.`,
        -15,
      ),
    )
  }

  const totalSyllables = first.syllables + last.syllables
  if (totalSyllables >= 6) {
    flags.push(
      flag(
        'too_long',
        'penalty',
        'Lang',
        `${totalSyllables} Silben zusammen. So ein Name wird im Alltag selten ganz ausgesprochen.`,
        -15,
      ),
    )
  }

  if (
    first.first_phoneme &&
    basePhoneme(first.first_phoneme) === basePhoneme(last.first_phoneme)
  ) {
    flags.push(
      flag(
        'alliteration',
        'penalty',
        'Stabreim',
        `Beide Teile beginnen mit demselben Laut. Das kann einprägsam wirken oder comichaft — hört jeder anders.`,
        -10,
      ),
    )
  }

  if (first.lastRime && first.lastRime === last.lastRime) {
    flags.push(
      flag(
        'rhyme',
        'penalty',
        'Endreim',
        `„${firstName}" und „${surname}" reimen sich auf „${first.lastRime}".`,
        -20,
      ),
    )
  }

  // --- Boni ---------------------------------------------------------------
  const syllableGap = Math.abs(first.syllables - last.syllables)
  if (syllableGap >= 2) {
    flags.push(
      flag(
        'rhythm_good',
        'bonus',
        'Guter Rhythmus',
        `${first.syllables} Silben gegen ${last.syllables} — der Wechsel gibt dem Namen Schwung.`,
        10,
      ),
    )
  }

  // PRD 5.1.2 formuliert "Nachname 1 Silbe und Vorname 2–3 Silben (oder umgekehrt)".
  // Testfall 3 in PRD 13 ("Kim" + "Maximilian") erwartet `balance_good` bei
  // 5 Silben; die Obergrenze 3 ist dort also nicht gemeint. Umgesetzt als:
  // ein Teil einsilbig, der andere mehrsilbig. Siehe README, Abweichungen.
  const oneIsShort =
    (last.syllables === 1 && first.syllables >= 2) ||
    (first.syllables === 1 && last.syllables >= 2)
  if (oneIsShort) {
    flags.push(
      flag(
        'balance_good',
        'bonus',
        'Kurz-lang-Balance',
        `Ein kurzer und ein langer Teil — die beiden stützen sich gegenseitig.`,
        10,
      ),
    )
  }

  // --- Anzeige-Flags ohne Score-Einfluss (PRD 5.1.3) -----------------------
  const initialsFlag = initialsCheck(firstName, surname)
  if (initialsFlag) flags.push(initialsFlag)
  const teasing = teasingCheck(firstName)
  if (teasing) flags.push(teasing)
  const spelling = spellingCheck(firstName)
  if (spelling) flags.push(spelling)
  flags.push(
    ...siblingCheck(firstName, opts.siblingNames ?? [], opts.styleVector, opts.siblingVectors),
  )

  const raw = flags.reduce((acc, f) => acc + f.delta, 100)
  const score = Math.min(100, Math.max(0, raw))

  return {
    score,
    light: toLight(score),
    flags,
    fullName: combined,
    genitive: `${genitive(firstName)} Jacke`,
  }
}

export function toLight(score: number): Light {
  if (score >= TUNING.sound.greenFrom) return 'green'
  if (score >= TUNING.sound.yellowFrom) return 'yellow'
  return 'red'
}

export const LIGHT_LABEL: Record<Light, string> = {
  green: 'Klingt zusammen',
  yellow: 'Geht, mit einer Kante',
  red: 'Reibt sich',
}
