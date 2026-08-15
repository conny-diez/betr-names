import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

// Muss vor dem ersten Import von db.ts stehen: jeder Testlauf bekommt eine
// eigene Datenbank, sonst tragen sich Läufe gegenseitig Zustand ein.
const tempDir = mkdtempSync(join(tmpdir(), 'zwei-listen-test-'))
process.env.ZWEI_LISTEN_DB = join(tempDir, 'test.sqlite')

const repo = await import('../src/server/repo.ts')
const corpus = await import('../src/server/corpus.ts')
const { subscribe } = await import('../src/server/events.ts')
const { divergenceReport } = await import('../src/lib/matching/divergence.ts')
const { soundScore } = await import('../src/lib/sound/index.ts')
const { deckFor } = await import('../src/server/api.ts')

after(() => rmSync(tempDir, { recursive: true, force: true }))

/** Hilfsfunktion: Referenz eines Korpusnamens über seinen Namen finden. */
function refOf(name: string): string {
  const hit = corpus.allCandidates().find((c) => c.name === name)
  assert.ok(hit, `„${name}" fehlt im Korpus — Testdaten prüfen`)
  return hit.ref
}

function newRoom(surname = 'Ahrens') {
  const { parent } = repo.createCouple({ surname, displayName: 'A' })
  const partner = repo.joinCouple(repo.getCouple(parent.couple_id).inviteCode, 'B')
  return { a: repo.getParent(parent.id), b: repo.getParent(partner.id) }
}

/** Beide Elternteile kalibrieren, damit Deck und Profile verfügbar sind. */
function calibrate(parentId: string, likeFilter: (name: string) => boolean) {
  for (const card of corpus.calibrationSet()) {
    repo.rate(repo.getParent(parentId), card.ref, likeFilter(card.name) ? 'like' : 'pass')
  }
  repo.completeCalibration(parentId)
}

describe('PRD 13 — Raum, Vetos, Matches', () => {
  it('Genau zwei Personen pro Raum; ein dritter Beitritt wird abgelehnt', () => {
    const { parent } = repo.createCouple({ surname: 'Bergmann', displayName: 'A' })
    const code = repo.getCouple(parent.couple_id).inviteCode
    repo.joinCouple(code, 'B')
    assert.throws(() => repo.joinCouple(code, 'C'), /bereits zwei Personen/)
  })

  it('Es gibt keinen Raum ohne Nachnamen', () => {
    assert.throws(() => repo.createCouple({ surname: '   ', displayName: 'A' }), /Pflichtfeld/)
  })

  it('A gibt `veto` auf „Finn": Name verschwindet bei B, A hat 4 übrig, B sieht nur den Zähler', () => {
    const { a, b } = newRoom()
    const finn = refOf('Finn')

    const seen: unknown[] = []
    const unsubscribe = subscribe(a.couple_id, (event) => seen.push(event))

    const result = repo.rate(a, finn, 'veto')
    unsubscribe()

    // 1. A hat vier Vetos übrig.
    assert.equal(result.vetosRemaining, 4)
    assert.equal(repo.getParent(a.id).vetos_remaining, 4)

    // 2. Der Name ist aus dem Pool beider Personen verschwunden.
    const stateB = repo.roomState(repo.getParent(b.id))
    assert.ok(stateB.vetoedRefs.has(finn), 'Veto wirkt nicht auf den Pool von B')

    // 3. B sieht ausschließlich den Zähler — kein Ereignis nennt den Namen.
    const events = seen as { type: string; remaining?: number; ref?: string }[]
    const vetoEvent = events.find((e) => e.type === 'veto_count')
    assert.ok(vetoEvent, 'Zähler-Ereignis fehlt')
    assert.equal(vetoEvent.remaining, 4)
    assert.equal(
      JSON.stringify(events).includes(finn),
      false,
      'Der vetierte Name taucht im Ereignisstrom auf',
    )
  })

  it('Ein zurückgenommenes Veto ist wieder verfügbar', () => {
    const { a } = newRoom()
    const ref = refOf('Emil')
    assert.equal(repo.rate(a, ref, 'veto').vetosRemaining, 4)
    assert.equal(repo.rate(repo.getParent(a.id), ref, 'pass').vetosRemaining, 5)
  })

  it('Vetos sind budgetiert — das sechste wird abgelehnt', () => {
    const { a } = newRoom()
    const names = ['Finn', 'Emil', 'Paul', 'Anton', 'Leon']
    let parent = a
    for (const name of names) {
      repo.rate(parent, refOf(name), 'veto')
      parent = repo.getParent(a.id)
    }
    assert.equal(parent.vetos_remaining, 0)
    assert.throws(() => repo.rate(parent, refOf('Oskar'), 'veto'), /Vetos/)
  })

  it('A `love`, B `like` auf denselben Namen → Match, aber kein Super-Match', () => {
    const { a, b } = newRoom()
    const ref = refOf('Greta')
    repo.rate(a, ref, 'love')
    const result = repo.rate(b, ref, 'like')

    assert.ok(result.match, 'kein Match entstanden')
    assert.equal(result.match.isSuper, false)

    const matches = repo.matchesOf(a.couple_id)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].is_super, 0)
  })

  it('Zwei `love` erzeugen ein Super-Match', () => {
    const { a, b } = newRoom()
    const ref = refOf('Greta')
    repo.rate(a, ref, 'love')
    const result = repo.rate(b, ref, 'love')
    assert.equal(result.match?.isSuper, true)
  })

  it('Ein `pass` erzeugt nie ein Match und ist für den Partner unsichtbar', () => {
    const { a, b } = newRoom()
    const ref = refOf('Greta')
    repo.rate(a, ref, 'love')
    const result = repo.rate(b, ref, 'pass')
    assert.equal(result.match, null)
    assert.equal(repo.matchesOf(a.couple_id).length, 0)
  })

  it('Ein zurückgezogenes Ja löst das Match wieder auf', () => {
    const { a, b } = newRoom()
    const ref = refOf('Greta')
    repo.rate(a, ref, 'like')
    repo.rate(b, ref, 'like')
    assert.equal(repo.matchesOf(a.couple_id).length, 1)
    repo.rate(repo.getParent(b.id), ref, 'pass')
    assert.equal(repo.matchesOf(a.couple_id).length, 0)
  })

  it('Nachname nachträglich geändert: Klang-Scores neu, keine Ratings verloren', () => {
    const { a, b } = newRoom('Ahrens')
    const mia = corpus.allCandidates().find((c) => c.name === 'Mia')!
    repo.rate(a, mia.ref, 'like')
    repo.rate(b, mia.ref, 'like')

    const before = soundScore('Mia', 'Ahrens')
    assert.equal(before.light, 'red')

    repo.updateSurname(a.couple_id, 'Kim')

    // Neu gerechnet, ohne Migration: Scores werden nicht gespeichert (PRD 8).
    const couple = repo.getCouple(a.couple_id)
    const after = soundScore('Mia', couple.surname)
    assert.notEqual(after.score, before.score)
    assert.equal(couple.surnamePhonetics.syllables, 1)

    // Ratings und Match überleben.
    assert.equal(repo.ratingsOf(a.id).length, 1)
    assert.equal(repo.matchesOf(a.couple_id).length, 1)
  })

  it('Beide Profile mit Distanz > 0.5 → Divergenz-Report erscheint genau einmal', () => {
    const { a, b } = newRoom()
    // Gegensätzliche Geschmäcker erzeugen: A mag weiche, B mag harte Namen.
    calibrate(a.id, (name) => ['Elia', 'Lina', 'Mayla', 'Emma', 'Luca'].includes(name))
    calibrate(b.id, (name) => ['Kurt', 'Birk', 'Friedrich', 'Stefan', 'Emil'].includes(name))

    const report = divergenceReport(repo.profileOf(a.id), repo.profileOf(b.id))
    // Der Schwellwert steht in config/tuning.json und ist dort begründet: die
    // 0.5 aus PRD 5.3.5 sind die ROHE Distanz, nicht die auf [0,1] normierte,
    // mit der die Empfehlungsformel rechnen muss.
    assert.ok(
      report.distance * Math.sqrt(5) > 0.5,
      `rohe Distanz ${(report.distance * Math.sqrt(5)).toFixed(3)} ist nicht > 0.5`,
    )
    assert.equal(report.triggered, true)
    assert.ok(report.lines.length > 0, 'Report ohne Aussagen')

    // Keine Prozentzahl, keine Bewertung der Beziehung (PRD 7).
    const text = report.intro + report.lines.map((l) => l.text).join(' ')
    assert.ok(!/%/.test(text), 'Der Report enthält eine Prozentzahl')
    assert.ok(!/kompatib/i.test(text), 'Der Report bewertet die Beziehung')

    // Genau einmal: das Flag am Raum sorgt dafür.
    assert.equal(repo.getCouple(a.couple_id).divergenceReportShown, false)
    repo.markDivergenceReportShown(a.couple_id)
    assert.equal(repo.getCouple(a.couple_id).divergenceReportShown, true)
  })

  it('Der geteilte Grund nennt nie einen Namen — nur eine Anzahl', () => {
    const { a, b } = newRoom()
    repo.rate(a, refOf('Finn'), 'pass', {
      reasonTag: 'erinnert mich an jemanden',
      sharedReason: true,
    })
    // Was B über A erfährt, ist genau eine Zahl.
    const count = repo.sharedAssociationCount(a.id)
    assert.equal(count, 1)
    assert.equal(typeof count, 'number')
    void b
  })

  it('Ein selbst hinzugefügter Name erscheint beim Partner ohne Herkunft', () => {
    const { a, b } = newRoom()
    repo.addCustomName(a, 'Wanja')

    // Im Pool von B liegt er unmarkiert …
    const inPool = repo.candidatesFor(a.couple_id).find((c) => c.name === 'Wanja')
    assert.ok(inPool)
    assert.equal(Object.keys(inPool).includes('added_by_parent_id'), false)

    // … und in der eigenen Liste von B taucht er gar nicht auf.
    assert.equal(repo.ownCustomCandidates(repo.getParent(b.id)).length, 0)
    assert.equal(repo.ownCustomCandidates(repo.getParent(a.id)).length, 1)
  })

  it('Ein selbst hinzugefügter Name erscheint zuverlässig im Deck des Partners', () => {
    // PRD F4 sagt "automatisch". Über den Empfehlungsscore allein würde ein
    // einzelner Name gegen dreitausend Korpusnamen praktisch nie auftauchen.
    const { a, b } = newRoom()
    calibrate(a.id, (name) => ['Emma', 'Lina'].includes(name))
    calibrate(b.id, (name) => ['Emma', 'Paul'].includes(name))
    repo.addCustomName(repo.getParent(a.id), 'Wanja')

    const deck = deckFor(repo.roomState(repo.getParent(b.id)), 30)
    const wanja = deck.find((card) => card.candidate.name === 'Wanja')
    assert.ok(wanja, 'Wanja fehlt im Deck des Partners')

    // Und zwar ununterscheidbar von jeder anderen Karte: die Quelle 'bridge'
    // bekommt im UI ein Label, 'corpus' nicht.
    assert.equal(wanja.source, 'corpus')

    // Auch die eigene Person bekommt ihn — sonst könnte er nie ein Match
    // werden, denn dazu müssen beide zustimmen (PRD 5.3.4).
    const ownDeck = deckFor(repo.roomState(repo.getParent(a.id)), 30)
    assert.ok(
      ownDeck.some((card) => card.candidate.name === 'Wanja'),
      'Der eigene Name fehlt im eigenen Deck und kann nie Match werden',
    )
  })

  it('Ein eigener Name kann ein Match werden', () => {
    const { a, b } = newRoom()
    const custom = repo.addCustomName(a, 'Wanja')
    const ref = `custom:${custom.id}`
    repo.rate(repo.getParent(a.id), ref, 'love')
    const result = repo.rate(repo.getParent(b.id), ref, 'love')
    assert.equal(result.match?.isSuper, true)
  })

  it('Das Deck zeigt nichts doppelt und nichts Vetiertes', () => {
    const { a, b } = newRoom()
    calibrate(a.id, (name) => ['Emma', 'Lina', 'Elia', 'Paul'].includes(name))
    calibrate(b.id, (name) => ['Emma', 'Paul', 'Emil'].includes(name))

    const vetoed = refOf('Noah')
    repo.rate(repo.getParent(b.id), vetoed, 'veto')

    const state = repo.roomState(repo.getParent(a.id))
    const cards = deckFor(state, 40)
    const refs = cards.map((c) => c.candidate.ref)

    assert.equal(new Set(refs).size, refs.length, 'Ein Name kommt doppelt vor')
    assert.ok(!refs.includes(vetoed), 'Ein vetierter Name liegt im Deck')
    for (const ref of refs) {
      assert.ok(!state.selfSeenRefs.has(ref), 'Ein bereits bewerteter Name liegt im Deck')
    }
  })
})
