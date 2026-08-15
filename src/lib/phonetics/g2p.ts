/**
 * Regelbasierte deutsche Graphem-zu-Phonem-Umwandlung.
 *
 * PRD 9.5 empfiehlt `phonemizer`/espeak-ng fuer den Build und eine "kompakte
 * deutsche Regeltabelle im Client" fuer nutzereingegebene Nachnamen. Wir
 * benutzen dieselbe Regeltabelle an beiden Stellen — sonst driften Build und
 * Laufzeit auseinander und derselbe Nachname bekaeme im Korpus einen anderen
 * Klang-Score als in der Eingabemaske.
 *
 * Nicht-deutsche Namen werden nach deutschen Regeln gelesen. Das ist Absicht
 * (PRD 9.5): der Name wird im deutschen Sprachraum gerufen.
 */

const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u', 'ä', 'ö', 'ü', 'y'])
const CONSONANT_LETTERS = new Set('bcdfghjklmnpqrstvwxzß'.split(''))

function isVowelLetter(c: string | undefined): boolean {
  return c !== undefined && VOWEL_LETTERS.has(c)
}

function isConsonantLetter(c: string | undefined): boolean {
  return c !== undefined && CONSONANT_LETTERS.has(c)
}

/**
 * Namen fuer die Regeln vorbereiten: Kleinschreibung, Akzente auf Grundvokale
 * zurueckfuehren (Renée → renee), Umlaute und ß bleiben erhalten.
 */
export function normalizeForG2P(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFC')
    // Umlaute und ß vor dem Akzent-Strippen parken
    .replace(/ä/g, '').replace(/ö/g, '').replace(/ü/g, '').replace(/ß/g, '')
    .replace(/[àáâãåā]/g, 'a')
    .replace(/[èéêëē]/g, 'e')
    .replace(/[ìíîïī]/g, 'i')
    .replace(/[òóôõō]/g, 'o')
    .replace(/[ùúûū]/g, 'u')
    .replace(/ç/g, 's')
    .replace(/ñ/g, 'n')
    .replace(/ł/g, 'l')
    .replace(//g, 'ä').replace(//g, 'ö').replace(//g, 'ü').replace(//g, 'ß')
    .replace(/[^a-zäöüß'\- ]/g, '')
}

/**
 * Vokallaenge: lang vor Dehnungs-h, am Wortende und vor einem einzelnen
 * Konsonanten; kurz vor Konsonantenclustern. Deckt den ueberwiegenden Teil
 * deutscher Namen ab.
 */
function isLongVowel(word: string, i: number): boolean {
  const next = word[i + 1]
  if (next === 'h') return true
  if (next === undefined) return true
  if (isVowelLetter(next)) return true
  const afterNext = word[i + 2]
  if (isConsonantLetter(next) && (afterNext === undefined || isVowelLetter(afterNext))) {
    // "Lu-kas": ein Konsonant zwischen zwei Vokalen -> offene Silbe -> lang.
    // "An-na": Doppelkonsonant faellt in den else-Zweig -> kurz.
    return afterNext !== undefined
  }
  return false
}

/**
 * Wird das `e` hier zum Schwa? In der unbetonten Endsilbe: -e, -en, -el, -em,
 * -es sowie deren s-Formen ("Ahrens" [ˈaːʁəns], "Hannes" [ˈhanəs]).
 */
function isSchwaContext(word: string, i: number): boolean {
  const rest = word.slice(i)
  return /^e[nlm]?s?$/.test(rest)
}

interface Emission {
  phonemes: string[]
  consumed: number
}

/**
 * Ein einzelner Namensteil (ohne Bindestrich/Leerzeichen) in Phoneme.
 */
function partToPhonemes(word: string): string[] {
  const out: string[] = []
  let i = 0

  const atStart = () => i === 0
  const peek = (n: number) => word.slice(i, i + n)
  const after = (n: number) => word[i + n]

  while (i < word.length) {
    const c = word[i]
    const emit = (phonemes: string[], consumed: number): Emission => ({ phonemes, consumed })
    let e: Emission | null = null

    // --- Mehrgraphen, laengste zuerst -------------------------------------
    if (peek(4) === 'dsch') e = emit(['dʒ'], 4)
    else if (peek(4) === 'tsch') e = emit(['tʃ'], 4)
    else if (peek(3) === 'sch') e = emit(['ʃ'], 3)
    else if (peek(3) === 'chs') e = emit(['k', 's'], 3)
    else if (peek(2) === 'ch') {
      if (atStart()) {
        // Christian [k], Charlotte [ʃ], Chiara [k]
        e = after(2) === 'a' ? emit(['ʃ'], 2) : emit(['k'], 2)
      } else {
        const prevPhoneme = out[out.length - 1] ?? ''
        // ach-Laut nach dunklen Vokalen, sonst ich-Laut
        e = /^(a|aː|ɔ|oː|ʊ|uː|aʊ)$/.test(prevPhoneme) ? emit(['x'], 2) : emit(['ç'], 2)
      }
    } else if (peek(2) === 'ck') e = emit(['k'], 2)
    else if (peek(2) === 'ph') e = emit(['f'], 2)
    else if (peek(2) === 'th') e = emit(['t'], 2)
    else if (peek(2) === 'sh') e = emit(['ʃ'], 2)
    else if (peek(2) === 'qu') e = emit(['k', 'v'], 2)
    else if (peek(2) === 'tz') e = emit(['ts'], 2)
    else if (peek(2) === 'zz') e = emit(['ts'], 2)
    else if (peek(2) === 'ss') e = emit(['s'], 2)
    else if (peek(2) === 'nk') e = emit(['ŋ', 'k'], 2)
    else if (peek(2) === 'ng' && !isVowelLetter(after(2))) e = emit(['ŋ'], 2)
    else if (peek(2) === 'ng') e = emit(['ŋ', 'g'], 2)
    else if (peek(2) === 'pf') e = emit(['pf'], 2)
    else if (peek(2) === 'sp' && atStart()) e = emit(['ʃ', 'p'], 2)
    else if (peek(2) === 'st' && atStart()) e = emit(['ʃ', 't'], 2)
    // --- Vokal-Digraphen ---------------------------------------------------
    // "ie" vor l/n ist Hiat statt Digraph, sobald der Name vorher schon einen
    // Vokal hatte: Ga-bri-el, Da-ni-e-la, Ma-ri-en-feld. Am Wortanfang bleibt
    // es der Langvokal: Niels, Wieland, Thiele.
    else if (
      peek(2) === 'ie' &&
      (after(2) === 'l' || after(2) === 'n') &&
      out.some((p) => VOWEL_SET.has(p))
    )
      e = emit(['iː', 'ɛ'], 2)
    else if (peek(2) === 'ie') e = emit(['iː'], after(2) === 'h' ? 3 : 2)
    else if (peek(2) === 'ei' || peek(2) === 'ai' || peek(2) === 'ay' || peek(2) === 'ey')
      e = emit(['aɪ'], 2)
    else if (peek(2) === 'au') e = emit(['aʊ'], 2)
    else if (peek(2) === 'eu' || peek(2) === 'äu') e = emit(['ɔʏ'], 2)
    else if (peek(2) === 'aa') e = emit(['aː'], 2)
    else if (peek(2) === 'ee') e = emit(['eː'], 2)
    else if (peek(2) === 'oo') e = emit(['oː'], 2)
    // -er am Wortende wird zum a-Schwa (Sommer, Alexander)
    else if (peek(2) === 'er' && i + 2 === word.length && out.length > 0) e = emit(['ɐ'], 2)

    // --- Doppelkonsonanten -------------------------------------------------
    if (!e && isConsonantLetter(c) && after(1) === c) {
      e = emit([], 1) // ersten wegwerfen, der zweite wird regulaer verarbeitet
    }

    // --- Einzelgrapheme ----------------------------------------------------
    if (!e) {
      const long = isLongVowel(word, i)
      switch (c) {
        case 'a': e = emit([long ? 'aː' : 'a'], 1); break
        case 'e':
          e = isSchwaContext(word, i) ? emit(['ə'], 1) : emit([long ? 'eː' : 'ɛ'], 1)
          break
        case 'i': e = emit([long ? 'iː' : 'ɪ'], 1); break
        case 'o': e = emit([long ? 'oː' : 'ɔ'], 1); break
        case 'u': e = emit([long ? 'uː' : 'ʊ'], 1); break
        case 'ä': e = emit([long ? 'ɛː' : 'ɛ'], 1); break
        case 'ö': e = emit([long ? 'øː' : 'œ'], 1); break
        case 'ü': e = emit([long ? 'yː' : 'ʏ'], 1); break
        case 'y':
          // Yannick [j], Sylvia [ʏ]
          e = atStart() && isVowelLetter(after(1)) ? emit(['j'], 1) : emit([long ? 'yː' : 'ʏ'], 1)
          break
        case 'h':
          // Dehnungs-h nach Vokal ist stumm, sonst Hauchlaut
          e = out.length > 0 && !isVowelLetter(after(1)) ? emit([], 1) : emit(['h'], 1)
          break
        case 'b': e = emit([i + 1 === word.length ? 'p' : 'b'], 1); break
        case 'd': e = emit([i + 1 === word.length ? 't' : 'd'], 1); break
        case 'g':
          if (i + 1 === word.length) {
            // Auslautverhaertung; "-ig" wird zum ich-Laut
            e = word.endsWith('ig') ? emit(['ç'], 1) : emit(['k'], 1)
          } else e = emit(['g'], 1)
          break
        case 'c':
          e = /[eiäöüy]/.test(after(1) ?? '') ? emit(['ts'], 1) : emit(['k'], 1)
          break
        case 's':
          // stimmhaft vor Vokal im Anlaut einer Silbe, sonst stimmlos
          e = isVowelLetter(after(1)) ? emit(['z'], 1) : emit(['s'], 1)
          break
        case 'ß': e = emit(['s'], 1); break
        case 'z': e = emit(['ts'], 1); break
        case 'x': e = emit(['k', 's'], 1); break
        case 'v': e = emit(['v'], 1); break
        case 'w': e = emit(['v'], 1); break
        case 'j': e = emit(['j'], 1); break
        case 'r': {
          // Nach Vokal im Silbenauslaut vokalisiert: "Lars" [laːɐs]
          const prev = out[out.length - 1]
          e = prev !== undefined && VOWEL_SET.has(prev) && !isVowelLetter(after(1))
            ? emit(['ɐ'], 1)
            : emit(['ʁ'], 1)
          break
        }
        case "'":
        case '-':
        case ' ':
          e = emit([], 1)
          break
        default:
          e = emit([c], 1)
      }
    }

    out.push(...e.phonemes)
    i += Math.max(1, e.consumed)
  }

  return out
}

// Lokale Kopie, um einen Zirkelimport mit inventory.ts zu vermeiden.
const VOWEL_SET = new Set([
  'a', 'aː', 'ɛ', 'ɛː', 'eː', 'ɪ', 'iː', 'ɔ', 'oː', 'ʊ', 'uː',
  'ʏ', 'yː', 'œ', 'øː', 'ə', 'ɐ', 'aɪ', 'aʊ', 'ɔʏ',
])

/**
 * Vollstaendiger Name (auch mehrteilig: "Anna-Sophie", "von Berg") in Phoneme.
 * Teile werden einzeln umgewandelt, weil Anlautregeln sonst nur am Anfang des
 * ersten Teils greifen wuerden ("Anna-Stefanie" braucht das [ʃt] im zweiten Teil).
 */
export function toPhonemes(name: string): string[] {
  return splitParts(name).flatMap((part) => partToPhonemes(part))
}

/** Namensteile: an Bindestrich und Leerzeichen trennen, Leeres verwerfen. */
export function splitParts(name: string): string[] {
  return normalizeForG2P(name)
    .split(/[\s-]+/)
    .map((p) => p.replace(/'/g, ''))
    .filter((p) => p.length > 0)
}

export { partToPhonemes }
