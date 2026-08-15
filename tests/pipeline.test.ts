import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { TUNING } from '../config/index.ts'
import { isName } from '../pipeline/02-clean.ts'
import { canonicalName } from '../pipeline/03-normalize.ts'
import { applyDistributionFilter, buildAttributions } from '../pipeline/09-export.ts'
import { SOURCES } from '../pipeline/sources.ts'
import { phoneticFields } from '../src/lib/phonetics/index.ts'
import type { CorpusName } from '../src/lib/types.ts'

const file = JSON.parse(readFileSync('data/corpus/names.json', 'utf8')) as {
  count: number
  distribution_safe: boolean
  names: CorpusName[]
}

describe('PRD 13 — Build mit DISTRIBUTION_SAFE=true', () => {
  /** Ein Datensatz mit einem Feld, dessen Lizenz eine Weitergabe nicht deckt. */
  function withRestrictedField(): CorpusName {
    const base = structuredClone(file.names[0])
    base.meaning = 'Bedeutungstext aus einer fremden Quelle'
    base.origin = 'fremd'
    base.provenance = {
      ...base.provenance,
      meaning: { source_id: 'behindthename', license: 'proprietary-restricted' },
      origin: { source_id: 'behindthename', license: 'proprietary-restricted' },
    }
    return base
  }

  it('entfernt alle Felder ohne verbreitungsfähige Lizenz', () => {
    const input = [withRestrictedField()]
    const { names, removed } = applyDistributionFilter(input, true)

    assert.equal(names[0].meaning, null, 'Bedeutung wurde nicht entfernt')
    assert.equal(names[0].origin, null, 'Herkunft wurde nicht entfernt')
    assert.equal(names[0].provenance.meaning, undefined, 'Provenienz blieb stehen')
    assert.ok(removed.some((entry) => entry.includes('proprietary-restricted')))
  })

  it('lässt in Modus A (DISTRIBUTION_SAFE=false) alles stehen', () => {
    const input = [withRestrictedField()]
    const { names, removed } = applyDistributionFilter(input, false)
    assert.equal(names[0].meaning, 'Bedeutungstext aus einer fremden Quelle')
    assert.equal(removed.length, 0)
  })

  it('erhält verbreitungsfähige Felder (CC BY, CC0, DL-DE-Zero, eigene)', () => {
    const { names } = applyDistributionFilter(structuredClone(file.names.slice(0, 50)), true)
    assert.equal(names.length, 50)
    for (const name of names) {
      assert.ok(name.name, 'Name selbst darf nie wegfallen')
      assert.ok(name.provenance.name, 'Provenienz des Namens fehlt')
    }
  })

  it('ATTRIBUTIONS.md ist vollständig: jede benutzte Quelle mit Lizenz und URL', () => {
    const used = new Set<string>()
    for (const name of file.names) {
      for (const prov of Object.values(name.provenance)) used.add(prov.source_id)
    }
    assert.ok(used.size > 0)

    const markdown = buildAttributions(used)
    for (const id of used) {
      const source = SOURCES[id]
      assert.ok(source, `Quelle "${id}" fehlt im Register`)
      assert.ok(markdown.includes(source.title), `Titel von "${id}" fehlt`)
      assert.ok(markdown.includes(source.license), `Lizenz von "${id}" fehlt`)
      if (source.url) assert.ok(markdown.includes(source.url), `URL von "${id}" fehlt`)
      if (source.attribution) {
        assert.ok(markdown.includes(source.attribution), `Pflichtangabe von "${id}" fehlt`)
      }
    }

    // Die ausgelieferte Datei muss denselben Stand haben.
    const onDisk = readFileSync('data/corpus/ATTRIBUTIONS.md', 'utf8')
    assert.ok(onDisk.includes('BerlinOnline'), 'Pflichtangabe fehlt in der erzeugten Datei')
    assert.ok(onDisk.includes('CC BY 3.0 DE'))
  })

  it('Jedes Feld im Korpus trägt eine source_id mit Lizenz (PRD 9.1)', () => {
    for (const name of file.names.slice(0, 200)) {
      for (const [field, prov] of Object.entries(name.provenance)) {
        assert.ok(prov.source_id, `${name.name}.${field} ohne source_id`)
        assert.ok(prov.license, `${name.name}.${field} ohne Lizenz`)
      }
    }
  })
})

describe('PRD 13 — Rohdaten zusammengeführt', () => {
  const blocked = new Set(['al', 'van', 'bin', 'vorname', 'familienname'])

  it('Nicht-Namen werden gefiltert (PRD 9.3.1)', () => {
    for (const junk of ['A', '', '   ', 'Kind 2', 'Name-mit-viel-zu-vielen-Zeichen', 'Vorname', 'bin', '123']) {
      assert.equal(isName(junk, blocked), null, `„${junk}" hätte gefiltert werden müssen`)
    }
  })

  it('Echte Namen überleben den Filter, inklusive Bindestrich, Apostroph und Diakritika', () => {
    assert.equal(isName('Mia', blocked), 'Mia')
    assert.equal(isName('anna-sophie', blocked), 'Anna-Sophie')
    assert.equal(isName('MAXIMILIAN', blocked), 'Maximilian')
    assert.equal(isName('Ömer', blocked), 'Ömer')
    assert.equal(isName('Anaïs', blocked), 'Anaïs')
    assert.equal(isName("N'Dea", blocked), "N'Dea")
  })

  it('Der gebaute Korpus enthält keine Nicht-Namen', () => {
    for (const name of file.names) {
      assert.match(name.name, /^[\p{L}][\p{L}\p{M}'\- ]*$/u, `„${name.name}" ist kein Name`)
      assert.ok(name.name.length >= 2 && name.name.length <= 20)
    }
  })

  it('Schreibvarianten sind zusammengeführt, bleiben aber sichtbar (PRD 9.3)', () => {
    assert.equal(canonicalName('Sofia'), 'Sophia')
    assert.equal(canonicalName('Fynn'), 'Finn')
    assert.equal(canonicalName('Mia'), 'Mia')

    const sophia = file.names.find((n) => n.name === 'Sophia')
    assert.ok(sophia, 'Sophia fehlt im Korpus')
    assert.ok(sophia.variants.length > 0, 'Varianten wurden verschluckt statt sichtbar gehalten')
  })

  it('Häufigkeiten stammen nur aus Erstnamen (PRD 9.3.2)', () => {
    // „Marie" steht in den Berliner Daten weit überwiegend an zweiter Position.
    // Ungefiltert wäre sie mit Abstand der häufigste Name; nach der
    // Erstnamen-Korrektur liegt sie hinter Namen wie Noah und Emilia.
    const ranked = [...file.names]
      .filter((n) => Object.keys(n.frequency_by_year).length > 0)
      .sort((a, b) => total(b) - total(a))

    const marie = ranked.findIndex((n) => n.name === 'Marie')
    assert.ok(marie > 0, 'Marie fehlt')
    assert.ok(
      marie >= 10,
      `Marie liegt auf Rang ${marie + 1} — die Positionskorrektur greift nicht`,
    )

    // Und die Jahresreihe darf keine Nullen oder negativen Werte enthalten.
    for (const name of file.names.slice(0, 300)) {
      for (const [year, count] of Object.entries(name.frequency_by_year)) {
        assert.ok(count > 0, `${name.name} ${year}: ${count}`)
        assert.ok(Number(year) >= 2012 && Number(year) <= 2100)
      }
    }
  })

  it('Der Zielumfang aus PRD 9.8 ist erreicht', () => {
    assert.ok(
      file.count >= TUNING.corpus.targetSize,
      `${file.count} Namen, erwartet mindestens ${TUNING.corpus.targetSize}`,
    )
  })

  it('Alle 20 Kalibrierungsnamen sind im Korpus', () => {
    const calibration = file.names.filter((n) => n.is_calibration_name)
    assert.equal(calibration.length, TUNING.calibration.setSize)
  })

  it('Gespeicherte Phonetik stimmt mit der Laufzeit-Engine überein', () => {
    // Sonst bewerten Korpus und Eingabemaske denselben Namen unterschiedlich.
    for (const name of file.names.slice(0, 400)) {
      const fresh = phoneticFields(name.name)
      assert.equal(fresh.syllables, name.syllables, name.name)
      assert.equal(fresh.phoneme_string, name.phoneme_string, name.name)
      assert.equal(fresh.stress_pattern, name.stress_pattern, name.name)
    }
  })

  it('Alle Stilvektoren liegen in [0,1]', () => {
    for (const name of file.names) {
      for (const [axis, value] of Object.entries(name.style_vector)) {
        assert.ok(
          typeof value === 'number' && value >= 0 && value <= 1,
          `${name.name}.${axis} = ${value}`,
        )
      }
    }
  })
})

function total(name: CorpusName): number {
  return Object.values(name.frequency_by_year).reduce((a, b) => a + b, 0)
}
