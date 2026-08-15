import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { TUNING } from '../config/index.ts'
import { buildDeck, styleVariance } from '../src/lib/matching/deck.ts'
import { rejectionPenalty, scoreCandidate } from '../src/lib/matching/recommend.ts'
import { computeProfile, type StyleProfile } from '../src/lib/style/calibration.ts'
import { styleDistance } from '../src/lib/style/vector.ts'
import type { CorpusName, NameCandidate, StyleVector } from '../src/lib/types.ts'

const corpus = JSON.parse(readFileSync('data/corpus/names.json', 'utf8')).names as CorpusName[]

const candidates: NameCandidate[] = corpus.map((n) => ({
  ref: `corpus:${n.id}`,
  name: n.name,
  gender: n.gender,
  origin: n.origin,
  meaning: n.meaning,
  syllables: n.syllables,
  stress_pattern: n.stress_pattern,
  first_phoneme: n.first_phoneme,
  last_phoneme: n.last_phoneme,
  ends_with_vowel: n.ends_with_vowel,
  starts_with_vowel: n.starts_with_vowel,
  sibilant_count: n.sibilant_count,
  phoneme_string: n.phoneme_string,
  style_vector: n.style_vector,
  frequency_by_year: n.frequency_by_year,
  nicknames: n.nicknames,
  rhyme_risks: n.rhyme_risks,
  variants: n.variants,
}))

function profileFrom(vector: StyleVector): StyleProfile {
  return {
    vector,
    confidence: { era: 0.9, softness: 0.9, reach: 0.9, frequency: 0.9, ambiguity: 0.9 },
    sampleSize: 20,
  }
}

/**
 * Simuliert eine Session: `rounds` Batches à `size` Karten. Nach jedem Batch
 * gelten alle Karten als bewertet, die Person sagt Ja zu allem, was nah an
 * ihrem Profil liegt, und Nein zum Rest. Genau so entsteht die Konvergenz,
 * gegen die die Divergenz-Injektion gebaut ist.
 */
function simulate(options: { disableDivergence: boolean; size: number; rounds: number }) {
  const selfProfile = profileFrom({ era: 0.3, softness: 0.75, reach: 0.4, frequency: 0.5, ambiguity: 0.1 })
  const partnerProfile = profileFrom({ era: 0.5, softness: 0.6, reach: 0.6, frequency: 0.45, ambiguity: 0.1 })

  const selfSeen = new Set<string>()
  const partnerSeen = new Set<string>()
  const rejected: StyleVector[] = []
  const shown: NameCandidate[] = []

  for (let round = 0; round < options.rounds; round++) {
    const deck = buildDeck({
      candidates,
      surname: 'Bergmann',
      selfProfile,
      partnerProfile,
      selfSeenRefs: selfSeen,
      partnerSeenRefs: partnerSeen,
      vetoedRefs: new Set(),
      bothRejectedVectors: rejected,
      genderPreference: 'open',
      size: options.size,
      seed: 4711 + round,
      disableDivergence: options.disableDivergence,
    })
    for (const card of deck) {
      selfSeen.add(card.candidate.ref)
      shown.push(card.candidate)
      if (styleDistance(card.candidate.style_vector, selfProfile.vector) > 0.25) {
        rejected.push(card.candidate.style_vector)
        partnerSeen.add(card.candidate.ref)
      }
    }
  }
  return shown
}

describe('PRD 13 — Deck und Empfehlungen', () => {
  it('100 Swipes: die Stilvarianz der letzten 20 Karten bleibt über dem Schwellwert', () => {
    // Regressionstest aus PRD 13. Der Schwellwert ist empirisch gesetzt: er
    // liegt unter der Varianz mit Injektion und über der ohne.
    const THRESHOLD = 0.16

    const withInjection = simulate({ disableDivergence: false, size: 25, rounds: 4 })
    const withoutInjection = simulate({ disableDivergence: true, size: 25, rounds: 4 })

    assert.equal(withInjection.length, 100)
    const varianceWith = styleVariance(withInjection.slice(-20))
    const varianceWithout = styleVariance(withoutInjection.slice(-20))

    assert.ok(
      varianceWith >= THRESHOLD,
      `Varianz mit Injektion ${varianceWith.toFixed(3)} unter dem Schwellwert ${THRESHOLD}`,
    )
    // Und der Nachweis, dass der Mechanismus überhaupt etwas tut: ohne ihn
    // konvergiert das Deck sichtbar (PRD 5.3.5).
    assert.ok(
      varianceWithout < varianceWith,
      `Ohne Injektion ${varianceWithout.toFixed(3)} ist nicht kleiner als mit ${varianceWith.toFixed(3)}`,
    )
  })

  it('Das Deck mischt drei Quellen im Verhältnis aus F3', () => {
    const deck = buildDeck({
      candidates,
      surname: 'Bergmann',
      selfProfile: profileFrom({ era: 0.4, softness: 0.7, reach: 0.5, frequency: 0.5, ambiguity: 0.1 }),
      partnerProfile: profileFrom({ era: 0.6, softness: 0.4, reach: 0.6, frequency: 0.4, ambiguity: 0.1 }),
      selfSeenRefs: new Set(),
      partnerSeenRefs: new Set(),
      vetoedRefs: new Set(),
      bothRejectedVectors: [],
      genderPreference: 'open',
      size: 100,
      seed: 99,
    })

    const share = (source: string) => deck.filter((c) => c.source === source).length / deck.length
    assert.ok(Math.abs(share('divergence') - TUNING.deck.shareDivergence) < 0.03)
    assert.ok(Math.abs(share('bridge') - TUNING.deck.shareBridge) < 0.03)
    assert.ok(Math.abs(share('corpus') - TUNING.deck.shareBaseCorpus) < 0.03)
  })

  it('Divergenzkarten liegen tatsächlich außerhalb des Zielvektors', () => {
    const selfProfile = profileFrom({ era: 0.3, softness: 0.8, reach: 0.4, frequency: 0.5, ambiguity: 0.1 })
    const partnerProfile = profileFrom({ era: 0.4, softness: 0.7, reach: 0.5, frequency: 0.5, ambiguity: 0.1 })
    const target = {
      era: 0.35,
      softness: 0.75,
      reach: 0.45,
      frequency: 0.5,
      ambiguity: 0.1,
    }

    const deck = buildDeck({
      candidates,
      surname: 'Bergmann',
      selfProfile,
      partnerProfile,
      selfSeenRefs: new Set(),
      partnerSeenRefs: new Set(),
      vetoedRefs: new Set(),
      bothRejectedVectors: [],
      genderPreference: 'open',
      size: 60,
      seed: 7,
    })

    for (const card of deck.filter((c) => c.source === 'divergence')) {
      assert.ok(
        styleDistance(card.candidate.style_vector, target) > TUNING.deck.divergenceMinDistance,
        `${card.candidate.name} liegt zu nah am Zielvektor`,
      )
    }
  })

  it('Brückenvorschläge hat noch keiner von beiden gesehen', () => {
    const seenByPartner = new Set(candidates.slice(0, 500).map((c) => c.ref))
    const deck = buildDeck({
      candidates,
      surname: 'Bergmann',
      selfProfile: profileFrom({ era: 0.3, softness: 0.8, reach: 0.4, frequency: 0.5, ambiguity: 0.1 }),
      partnerProfile: profileFrom({ era: 0.7, softness: 0.3, reach: 0.6, frequency: 0.5, ambiguity: 0.1 }),
      selfSeenRefs: new Set(),
      partnerSeenRefs: seenByPartner,
      vetoedRefs: new Set(),
      bothRejectedVectors: [],
      genderPreference: 'open',
      size: 60,
      seed: 3,
    })
    for (const card of deck.filter((c) => c.source === 'bridge')) {
      assert.ok(!seenByPartner.has(card.candidate.ref), `${card.candidate.name} war dem Partner bekannt`)
    }
  })

  it('penalty greift erst ab zwei nahen Ablehnungen', () => {
    const vector: StyleVector = { era: 0.5, softness: 0.5, reach: 0.5, frequency: 0.5, ambiguity: 0.1 }
    const near: StyleVector = { era: 0.52, softness: 0.51, reach: 0.5, frequency: 0.5, ambiguity: 0.1 }
    assert.equal(rejectionPenalty(vector, []), 0)
    assert.equal(rejectionPenalty(vector, [near]), 0, 'eine Ablehnung reicht nicht')
    assert.ok(rejectionPenalty(vector, [near, near]) > 0)
  })

  it('Die Empfehlungsformel benutzt die Gewichte aus der Konfiguration', () => {
    const candidate = candidates[0]
    const scored = scoreCandidate(candidate, {
      targetVector: candidate.style_vector,
      surname: 'Bergmann',
      seenRefs: new Set(),
      bothRejectedVectors: [],
    })
    const w = TUNING.recommendation
    const expected =
      w.w1_styleDistance * 1 + w.w2_soundScore * (scored.soundScore / 100) + w.w3_novelty * 1
    assert.ok(Math.abs(scored.score - expected) < 1e-9)
  })

  it('Ein Profil aus Bewertungen folgt der Formel aus 5.2.2', () => {
    const yes: StyleVector = { era: 0.8, softness: 0.8, reach: 0.8, frequency: 0.8, ambiguity: 0.8 }
    const no: StyleVector = { era: 0.2, softness: 0.2, reach: 0.2, frequency: 0.2, ambiguity: 0.2 }
    const profile = computeProfile([
      { vector: yes, value: 'like' },
      { vector: no, value: 'pass' },
    ])
    // 0.8 - 0.5 * (0.2 - 0.5) = 0.95
    assert.ok(Math.abs(profile.vector.era - 0.95) < 1e-9)
  })

  it('Achsen ohne Trennschärfe bekommen niedrige Confidence', () => {
    const spread = computeProfile(
      [0.05, 0.95, 0.1, 0.9].map((v) => ({
        vector: { era: v, softness: 0.5, reach: 0.5, frequency: 0.5, ambiguity: 0.5 },
        value: 'like' as const,
      })),
    )
    assert.ok(spread.confidence.era < 0.4, 'gestreute Ja-Namen müssen unsicher sein')
    assert.ok(spread.confidence.softness > 0.9, 'einheitliche Achse muss sicher sein')
  })
})
