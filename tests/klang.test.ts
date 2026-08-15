import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { soundScore } from '../src/lib/sound/index.ts'
import { analyze, initials } from '../src/lib/phonetics/index.ts'
import { genitive } from '../src/lib/sound/checks.ts'

const codes = (first: string, last: string) =>
  soundScore(first, last).flags.map((f) => f.code)

describe('PRD 13 — Klang-Engine', () => {
  it('Nachname „Ahrens", Vorname „Mia" → vowel_clash, Score < 50, rote Ampel', () => {
    const result = soundScore('Mia', 'Ahrens')
    assert.ok(result.flags.some((f) => f.code === 'vowel_clash'), 'vowel_clash fehlt')
    assert.ok(result.score < 50, `Score ${result.score} ist nicht < 50`)
    assert.equal(result.light, 'red')
    // Das Flag muss sich im Klartext erklären (PRD 5.1.2).
    const flag = result.flags.find((f) => f.code === 'vowel_clash')!
    assert.match(flag.explanation, /Vokale/)
    assert.match(flag.explanation, /MiaAhrens/)
  })

  it('Nachname „Schulz", Vorname „Lars" → sibilant_overload, gelbe Ampel', () => {
    const result = soundScore('Lars', 'Schulz')
    assert.ok(result.flags.some((f) => f.code === 'sibilant_overload'))
    assert.equal(result.light, 'yellow')
  })

  it('Nachname „Kim", Vorname „Maximilian" → rhythm_good + balance_good, Score > 85', () => {
    const result = soundScore('Maximilian', 'Kim')
    assert.ok(result.flags.some((f) => f.code === 'rhythm_good'), 'rhythm_good fehlt')
    assert.ok(result.flags.some((f) => f.code === 'balance_good'), 'balance_good fehlt')
    assert.ok(result.score > 85, `Score ${result.score} ist nicht > 85`)
  })

  it('Nachname „Sommer", Vorname „Anna-Sophie" → initials_warning (A.S.S.)', () => {
    assert.equal(initials('Anna-Sophie') + initials('Sommer'), 'ASS')
    assert.ok(codes('Anna-Sophie', 'Sommer').includes('initials_warning'))
  })

  it('Rot ist nie ein Ausschluss — der Name kommt trotzdem mit Erklärung zurück', () => {
    const result = soundScore('Mia', 'Ahrens')
    assert.equal(result.fullName, 'Mia Ahrens')
    assert.ok(result.flags.every((f) => f.explanation.length > 10))
  })

  it('Score bleibt in [0,100] geklemmt', () => {
    for (const [first, last] of [
      ['Maximilian', 'Kim'],
      ['Sascha', 'Schulz-Schuster'],
      ['Mia', 'Ahrens'],
      ['A', 'B'],
    ]) {
      const { score } = soundScore(first, last)
      assert.ok(score >= 0 && score <= 100, `${first} ${last} → ${score}`)
    }
  })

  it('Genitiv-Probe: s/ß/x/z bekommen Apostroph', () => {
    assert.equal(genitive('Lukas'), "Lukas'")
    assert.equal(genitive('Max'), "Max'")
    assert.equal(genitive('Mila'), 'Milas')
    assert.equal(genitive('Moritz'), "Moritz'")
  })

  it('Reim-Check bleibt sparsam — Allerweltsnamen lösen ihn nicht aus', () => {
    assert.ok(!codes('Leon', 'Meier').includes('teasing_risk'))
    assert.ok(codes('Jan', 'Meier').includes('teasing_risk'))
  })

  it('Initialen-Warnung mit zwei Buchstaben nur bei exakter Übereinstimmung', () => {
    // „Sophia Ahrens" ergibt SA — das darf keine NS-Warnung auslösen,
    // sonst ist die Warnung wertlos.
    assert.ok(!codes('Sophia', 'Ahrens').includes('initials_warning'))
  })
})

describe('Phonetik-Modul', () => {
  it('leitet Silbenzahl aus den Vokalkernen ab', () => {
    assert.equal(analyze('Lars').syllables, 1, 'vokalisiertes r bildet keine eigene Silbe')
    assert.equal(analyze('Mia').syllables, 2)
    assert.equal(analyze('Maximilian').syllables, 5)
    assert.equal(analyze('Anna-Sophie').syllables, 4)
    assert.equal(analyze('Sommer').syllables, 2)
  })

  it('erkennt Anlaut und Auslaut', () => {
    const ahrens = analyze('Ahrens')
    assert.equal(ahrens.starts_with_vowel, true)
    assert.equal(ahrens.ends_with_vowel, false)
    assert.equal(ahrens.last_phoneme, 's')
  })

  it('zählt Zischlaute', () => {
    assert.equal(analyze('Schulz').sibilant_count, 2, 'ʃ und ts')
    assert.equal(analyze('Lars').sibilant_count, 1)
  })

  it('Betonungsmuster hat genau eine Ziffer pro Silbe', () => {
    for (const name of ['Mia', 'Maximilian', 'Alexander', 'Josefine', 'Charlotte', 'Lars']) {
      const a = analyze(name)
      assert.equal(a.stress_pattern.length, a.syllables, `${name}: ${a.stress_pattern}`)
    }
  })

  it('liest „ie" vor l/n als Hiat, sobald vorher ein Vokal stand', () => {
    assert.equal(analyze('Gabriel').syllables, 3)
    assert.equal(analyze('Daniel').syllables, 3)
    // am Wortanfang bleibt es der Langvokal
    assert.equal(analyze('Niels').syllables, 1)
  })
})
