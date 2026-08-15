import { TUNING } from '../../../config'
import { styleDistance } from '../style/vector'
import type { StyleProfile } from '../style/calibration'
import { STYLE_AXES, type GenderPreference, type NameCandidate, type StyleAxis, type StyleVector } from '../types'
import { makeRandom, shuffle } from './random'
import { scoreAll, type RecommendationContext } from './recommend'

export type CardSource = 'corpus' | 'bridge' | 'divergence'

export interface DeckCard {
  candidate: NameCandidate
  source: CardSource
}

export interface DeckInput {
  candidates: readonly NameCandidate[]
  surname: string
  selfProfile: StyleProfile
  /** null, solange der Partner die Kalibrierung nicht abgeschlossen hat */
  partnerProfile: StyleProfile | null
  /** Refs, die diese Person schon bewertet hat */
  selfSeenRefs: ReadonlySet<string>
  /** Refs, die der Partner schon bewertet hat — nur fuer `novelty`, nie sichtbar */
  partnerSeenRefs: ReadonlySet<string>
  /** Vetos beider Personen. Fuer die jeweils andere Person unsichtbar entfernt. */
  vetoedRefs: ReadonlySet<string>
  bothRejectedVectors: readonly StyleVector[]
  genderPreference: GenderPreference
  siblingNames?: string[]
  /**
   * Refs, die vorrangig ins Deck gehören — die selbst hinzugefügten Namen des
   * Partners (PRD F4: "erscheinen **automatisch** im Deck des Partners").
   *
   * Ohne diesen Vorrang konkurrieren sie über den Empfehlungsscore mit
   * dreitausend Korpusnamen und tauchen praktisch nie auf. Sie laufen trotzdem
   * als reguläre Karten mit: keine Markierung, keine eigene Quelle, kein
   * Hinweis auf die Herkunft.
   */
  priorityRefs?: ReadonlySet<string>
  size?: number
  seed: number
  /** Nur fuer den Regressionstest aus PRD 13: Divergenz-Injektion abschalten. */
  disableDivergence?: boolean
}

function matchesGender(candidate: NameCandidate, pref: GenderPreference): boolean {
  if (pref === 'open') return true
  if (candidate.gender === 'neutral') return true
  return pref === 'male' ? candidate.gender === 'm' : candidate.gender === 'f'
}

/**
 * Baut den naechsten Deck-Stapel (PRD F3).
 *
 * Mischung: 60 % Grundkorpus nach eigenem Stilprofil, 25 % Brueckenvorschlaege
 * zwischen beiden Profilen, 15 % Divergenz-Injektion.
 *
 * Zwei Regeln sind hier nicht verhandelbar:
 * - Vetos verschwinden lueckenlos. Kein Hinweis, keine Markierung, kein Platzhalter.
 * - Selbst hinzugefuegte Namen des Partners laufen ohne Herkunftskennzeichnung
 *   mit (PRD F4) — das erledigt der Aufrufer, indem er sie in `candidates` legt.
 */
export function buildDeck(input: DeckInput): DeckCard[] {
  const size = input.size ?? TUNING.deck.batchSize
  const random = makeRandom(input.seed)

  const eligible = input.candidates.filter(
    (c) =>
      !input.vetoedRefs.has(c.ref) &&
      !input.selfSeenRefs.has(c.ref) &&
      matchesGender(c, input.genderPreference),
  )
  if (!eligible.length) return []

  const targetVector = input.partnerProfile
    ? midpointOf(input.selfProfile.vector, input.partnerProfile.vector)
    : input.selfProfile.vector

  const seenRefs = new Set<string>([...input.selfSeenRefs, ...input.partnerSeenRefs])
  const ctx: RecommendationContext = {
    targetVector,
    surname: input.surname,
    seenRefs,
    bothRejectedVectors: input.bothRejectedVectors,
    siblingNames: input.siblingNames,
    axisWeights: combinedAxisWeights(input.selfProfile, input.partnerProfile),
  }

  const scored = scoreAll(eligible, ctx)

  const wantDivergence = input.disableDivergence
    ? 0
    : Math.round(size * TUNING.deck.shareDivergence)
  const wantBridge = input.partnerProfile ? Math.round(size * TUNING.deck.shareBridge) : 0
  const wantCorpus = size - wantDivergence - wantBridge

  const used = new Set<string>()
  const take = (list: typeof scored, n: number, source: CardSource): DeckCard[] => {
    const out: DeckCard[] = []
    for (const s of list) {
      if (out.length >= n) break
      if (used.has(s.candidate.ref)) continue
      used.add(s.candidate.ref)
      out.push({ candidate: s.candidate, source })
    }
    return out
  }

  // Vorrang: die eigenen Namen des Partners. Als 'corpus' gekennzeichnet,
  // damit sie im UI von jeder anderen Karte ununterscheidbar sind.
  const priority = input.priorityRefs?.size
    ? take(
        scored.filter((s) => input.priorityRefs!.has(s.candidate.ref)),
        Math.min(input.priorityRefs.size, Math.ceil(size / 4)),
        'corpus',
      )
    : []

  // Bruecke: nahe am Zielvektor und von keinem der beiden gesehen (PRD 5.3.5).
  const bridge = take(
    scored.filter((s) => s.novelty === 1),
    wantBridge,
    'bridge',
  )

  // Divergenz-Injektion: bewusst ausserhalb des Zielvektors (PRD 5.3.5).
  // Innerhalb des Ausreisser-Pools wird zufaellig gezogen, nicht nach Score —
  // sonst waeren es immer dieselben Ausreisser.
  const divergencePool = shuffle(
    scored.filter((s) => s.distance > TUNING.deck.divergenceMinDistance),
    random,
  )
  const divergence = take(divergencePool, wantDivergence, 'divergence')

  // Grundkorpus: nach dem eigenen Profil sortiert, nicht nach dem Zielvektor.
  const corpusRanked = [...scored].sort(
    (a, b) =>
      styleDistance(a.candidate.style_vector, input.selfProfile.vector) -
      styleDistance(b.candidate.style_vector, input.selfProfile.vector),
  )
  const corpus = take(corpusRanked, Math.max(0, wantCorpus - priority.length), 'corpus')

  // Auffuellen, falls ein Topf leer lief (kleiner Korpus, viele Vetos).
  const used_ = priority.length + bridge.length + divergence.length + corpus.length
  const filler = take(scored, size - used_, 'corpus')

  return interleave([...priority, ...corpus, ...bridge, ...divergence, ...filler], random)
}

/**
 * Die drei Quellen so verteilen, dass Ausreisser nicht am Stueck kommen.
 * Ein Block von drei Divergenzkarten hintereinander liest sich wie ein Fehler.
 */
function interleave(cards: DeckCard[], random: () => number): DeckCard[] {
  const buckets: Record<CardSource, DeckCard[]> = {
    corpus: cards.filter((c) => c.source === 'corpus'),
    bridge: cards.filter((c) => c.source === 'bridge'),
    divergence: cards.filter((c) => c.source === 'divergence'),
  }
  const out: DeckCard[] = []
  const total = cards.length
  while (out.length < total) {
    const remaining = (['corpus', 'bridge', 'divergence'] as CardSource[]).filter(
      (s) => buckets[s].length > 0,
    )
    if (!remaining.length) break
    // Wahrscheinlichkeit proportional zur Restmenge, damit sich die Toepfe
    // gleichmaessig leeren.
    const weights = remaining.map((s) => buckets[s].length)
    const pick = weightedPick(remaining, weights, random)
    out.push(buckets[pick].shift()!)
  }
  return out
}

function weightedPick<T>(items: T[], weights: number[], random: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/**
 * Achsengewichte aus der Confidence beider Profile (PRD 5.2.2).
 *
 * Wo sich beide festgelegt haben, zählt die Achse voll. Wo einer von beiden
 * unentschieden ist, zählt sie weniger — dort ist die Distanz kein Signal,
 * sondern Rauschen. Der Sockel verhindert, dass eine Achse ganz verschwindet.
 */
function combinedAxisWeights(
  self: StyleProfile,
  partner: StyleProfile | null,
): Record<StyleAxis, number> {
  const weights = {} as Record<StyleAxis, number>
  for (const axis of STYLE_AXES) {
    const confidence = partner
      ? Math.min(self.confidence[axis], partner.confidence[axis])
      : self.confidence[axis]
    weights[axis] = 0.25 + 0.75 * confidence
  }
  return weights
}

function midpointOf(a: StyleVector, b: StyleVector): StyleVector {
  return {
    era: (a.era + b.era) / 2,
    softness: (a.softness + b.softness) / 2,
    reach: (a.reach + b.reach) / 2,
    frequency: (a.frequency + b.frequency) / 2,
    ambiguity: (a.ambiguity + b.ambiguity) / 2,
  }
}

/**
 * Mittlere paarweise Stildistanz einer Kartenfolge.
 * Messgroesse fuer den Regressionstest aus PRD 13: die Stilvarianz der letzten
 * Karten darf nicht unter den Schwellwert fallen, sonst zeigt das Deck nur noch
 * Varianten desselben Namens.
 */
export function styleVariance(cards: readonly { style_vector: StyleVector }[]): number {
  if (cards.length < 2) return 0
  let sum = 0
  let pairs = 0
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      sum += styleDistance(cards[i].style_vector, cards[j].style_vector)
      pairs++
    }
  }
  return sum / pairs
}
