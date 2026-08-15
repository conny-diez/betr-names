import { isVowel } from './inventory'

export interface Syllable {
  onset: string[]
  nucleus: string
  coda: string[]
}

/**
 * Ist dieses Phonem ein Silbenkern?
 *
 * Sonderfall [ɐ]: das vokalisierte r bildet nach einem Vokal keine eigene
 * Silbe ("Lars" ist einsilbig), nach einem Konsonanten schon ("Som-mer").
 */
function isNucleus(phonemes: string[], index: number): boolean {
  const p = phonemes[index]
  if (!isVowel(p)) return false
  if (p === 'ɐ') {
    const prev = phonemes[index - 1]
    return prev === undefined || !isVowel(prev)
  }
  return true
}

/**
 * Silbentrennung nach dem Prinzip des maximalen Anfangsrands mit
 * Mindest-Endrand: von den Konsonanten zwischen zwei Kernen geht genau einer
 * in den Anfangsrand der folgenden Silbe, der Rest in den Endrand der
 * vorangehenden.
 *
 * PRD 9.5 weist ausdruecklich darauf hin, dass die Silbenebene selbst
 * abgeleitet werden muss — espeak liefert sie nicht.
 */
export function syllabify(phonemes: string[]): Syllable[] {
  const nuclei: number[] = []
  for (let i = 0; i < phonemes.length; i++) {
    if (isNucleus(phonemes, i)) nuclei.push(i)
  }
  if (nuclei.length === 0) {
    // Namen ohne erkennbaren Vokal: als eine Silbe behandeln, statt 0 zu melden.
    return phonemes.length ? [{ onset: [], nucleus: phonemes[0], coda: phonemes.slice(1) }] : []
  }

  return nuclei.map((nucleusIndex, k) => {
    const prevNucleus = k === 0 ? -1 : nuclei[k - 1]
    const nextNucleus = k === nuclei.length - 1 ? phonemes.length : nuclei[k + 1]

    const between = phonemes.slice(prevNucleus + 1, nucleusIndex)
    const onset = k === 0 ? between : between.slice(Math.max(0, between.length - 1))

    const trailing = phonemes.slice(nucleusIndex + 1, nextNucleus)
    const coda =
      k === nuclei.length - 1 ? trailing : trailing.slice(0, Math.max(0, trailing.length - 1))

    return { onset, nucleus: phonemes[nucleusIndex], coda }
  })
}

/** Reim der Silbe: Kern + Endrand. Basis fuer die Endreim-Regel aus PRD 5.1.2. */
export function rime(syllable: Syllable): string {
  return syllable.nucleus.replace(/ː/g, '') + syllable.coda.join('')
}

/**
 * Betonungsmuster als Ziffernkette ("10" Trochaeus, "01" Jambus, "100" Daktylus).
 *
 * Bekannte Grenze: verlaessliche deutsche Betonungsvorhersage ist ein
 * ungeloestes Problem, besonders bei Lehnnamen. Die Heuristik unten trifft die
 * grosse Mehrheit; der Rest laeuft ueber `stress-overrides.json`, das die
 * Pipeline erweitern kann. Der Wert fliesst nur in eine einzige, weiche Regel
 * ein (`rhythm_flat`, −15), deshalb ist die Restunschaerfe vertretbar.
 */
export function stressPattern(syllables: Syllable[], override?: string): string {
  const n = syllables.length
  // Override nur uebernehmen, wenn er zur Silbenzahl passt — sonst waere
  // `rhythm_flat` mit einem Muster falscher Laenge zu vergleichen.
  if (override && override.length === n) return override
  if (n === 0) return ''
  if (n === 1) return '1'
  if (n === 2) return '10'

  const nuclei = syllables.map((s) => s.nucleus)
  const last = nuclei[n - 1]

  // Endsilbe mit Schwa: Betonung auf die vorletzte Silbe (Jo-se-FI-ne, A-le-XAN-der)
  if (last === 'ə' || last === 'ɐ') return mark(n, n - 2)

  // Hiat auf -ia/-io/-ian: Betonung drei Silben vor dem Ende (Ma-xi-MI-li-an)
  const secondLast = nuclei[n - 2]
  const isHiatus =
    syllables[n - 1].onset.length === 0 && (secondLast === 'iː' || secondLast === 'ɪ')
  if (isHiatus && n >= 4) return mark(n, n - 3)

  // Germanischer Default: Erstsilbenbetonung
  return mark(n, 0)
}

function mark(length: number, stressedIndex: number): string {
  return Array.from({ length }, (_, i) => (i === stressedIndex ? '1' : '0')).join('')
}
