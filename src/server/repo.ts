import { TUNING } from '@config/index'
import { analyze, phoneticFields } from '@/lib/phonetics'
import { evaluateMatch } from '@/lib/matching/match'
import { computeProfile, EMPTY_PROFILE, type StyleProfile } from '@/lib/style/calibration'
import { styleDistance } from '@/lib/style/vector'
import type {
  CustomName,
  GenderPreference,
  NameCandidate,
  Phonetics,
  RatingValue,
  StyleVector,
  TrialVerdict,
} from '@/lib/types'
import { allCandidates, candidateByRef, customRef } from './corpus'
import { db, newId, newInviteCode, nowIso } from './db'
import { publish } from './events'
import type { ParentRow } from './session'

export interface CoupleRow {
  id: string
  invite_code: string
  surname: string
  surname_phonetics: string
  due_date: string | null
  gender_preference: GenderPreference
  sibling_names: string
  secondary_language: string | null
  created_at: string
  divergence_report_shown: number
}

export interface Couple {
  id: string
  inviteCode: string
  surname: string
  surnamePhonetics: Phonetics
  dueDate: string | null
  genderPreference: GenderPreference
  siblingNames: string[]
  secondaryLanguage: string | null
  divergenceReportShown: boolean
  createdAt: string
}

export function toCouple(row: CoupleRow): Couple {
  return {
    id: row.id,
    inviteCode: row.invite_code,
    surname: row.surname,
    surnamePhonetics: JSON.parse(row.surname_phonetics) as Phonetics,
    dueDate: row.due_date,
    genderPreference: row.gender_preference,
    siblingNames: JSON.parse(row.sibling_names) as string[],
    secondaryLanguage: row.secondary_language,
    divergenceReportShown: row.divergence_report_shown === 1,
    createdAt: row.created_at,
  }
}

export function getCouple(id: string): Couple {
  const row = db().prepare('SELECT * FROM couple WHERE id = ?').get(id) as CoupleRow | undefined
  if (!row) throw new Error('Raum nicht gefunden')
  return toCouple(row)
}

// --- Raum anlegen und beitreten (PRD F1) ------------------------------------

export interface CreateCoupleInput {
  surname: string
  displayName: string
  genderPreference?: GenderPreference
  siblingNames?: string[]
  secondaryLanguage?: string | null
  dueDate?: string | null
}

export function createCouple(input: CreateCoupleInput): { couple: Couple; parent: ParentRow } {
  const surname = input.surname.trim()
  if (!surname) throw new Error('Der Nachname ist ein Pflichtfeld.')

  const coupleId = newId('cpl')
  const parentId = newId('prt')
  const database = db()

  database
    .prepare(
      `INSERT INTO couple (id, invite_code, surname, surname_phonetics, due_date,
                           gender_preference, sibling_names, secondary_language, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      coupleId,
      newInviteCode(),
      surname,
      JSON.stringify(phoneticFields(surname)),
      input.dueDate ?? null,
      input.genderPreference ?? 'open',
      JSON.stringify(input.siblingNames ?? []),
      input.secondaryLanguage ?? null,
      nowIso(),
    )

  database
    .prepare(
      `INSERT INTO parent (id, couple_id, display_name, vetos_remaining, slot, created_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(parentId, coupleId, input.displayName.trim() || 'Elternteil A', TUNING.vetos.perParent, 0, nowIso())

  return { couple: getCouple(coupleId), parent: getParent(parentId) }
}

/**
 * Beitritt über den Einladungscode.
 *
 * PRD F1: "Genau zwei Personen pro Raum. Ein dritter Beitrittsversuch wird
 * abgelehnt." Kein Mehrpersonen-Modus im MVP (PRD 2, Nicht-Ziele).
 */
export function joinCouple(code: string, displayName: string): ParentRow {
  const database = db()
  const row = database
    .prepare('SELECT * FROM couple WHERE invite_code = ?')
    .get(code.trim().toUpperCase()) as CoupleRow | undefined
  if (!row) throw new Error('Dieser Code gehört zu keinem Raum.')

  const count = database
    .prepare('SELECT COUNT(*) AS n FROM parent WHERE couple_id = ?')
    .get(row.id) as { n: number }
  if (count.n >= 2) throw new Error('In diesem Raum sind bereits zwei Personen.')

  const parentId = newId('prt')
  database
    .prepare(
      `INSERT INTO parent (id, couple_id, display_name, vetos_remaining, slot, created_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(parentId, row.id, displayName.trim() || 'Elternteil B', TUNING.vetos.perParent, 1, nowIso())

  const parent = getParent(parentId)
  publish(row.id, { type: 'partner_joined', displayName: parent.display_name })
  return parent
}

export function getParent(id: string): ParentRow {
  const row = db().prepare('SELECT * FROM parent WHERE id = ?').get(id) as ParentRow | undefined
  if (!row) throw new Error('Elternteil nicht gefunden')
  return row
}

export function parentsOf(coupleId: string): ParentRow[] {
  return db()
    .prepare('SELECT * FROM parent WHERE couple_id = ? ORDER BY slot')
    .all(coupleId) as ParentRow[]
}

export function partnerOf(parent: ParentRow): ParentRow | null {
  const row = db()
    .prepare('SELECT * FROM parent WHERE couple_id = ? AND id != ? LIMIT 1')
    .get(parent.couple_id, parent.id) as ParentRow | undefined
  return row ?? null
}

/**
 * Nachname ändern (PRD F1: nachträglich änderbar, Neuberechnung aller
 * Klang-Scores). Die Neuberechnung ist ein No-op, weil Klang-Scores nicht
 * gespeichert werden — es bleibt die neue Phonetik. Ratings bleiben unberührt.
 */
export function updateSurname(coupleId: string, surname: string): Couple {
  const trimmed = surname.trim()
  if (!trimmed) throw new Error('Der Nachname ist ein Pflichtfeld.')
  db()
    .prepare('UPDATE couple SET surname = ?, surname_phonetics = ? WHERE id = ?')
    .run(trimmed, JSON.stringify(phoneticFields(trimmed)), coupleId)
  publish(coupleId, { type: 'surname_changed', surname: trimmed })
  return getCouple(coupleId)
}

export function updateCoupleSettings(
  coupleId: string,
  patch: Partial<Pick<CreateCoupleInput, 'genderPreference' | 'siblingNames' | 'secondaryLanguage' | 'dueDate'>>,
): Couple {
  const current = getCouple(coupleId)
  db()
    .prepare(
      'UPDATE couple SET gender_preference = ?, sibling_names = ?, secondary_language = ?, due_date = ? WHERE id = ?',
    )
    .run(
      patch.genderPreference ?? current.genderPreference,
      JSON.stringify(patch.siblingNames ?? current.siblingNames),
      patch.secondaryLanguage !== undefined ? patch.secondaryLanguage : current.secondaryLanguage,
      patch.dueDate !== undefined ? patch.dueDate : current.dueDate,
      coupleId,
    )
  return getCouple(coupleId)
}

/** Vollständige Löschung, ohne Rückfragen, ohne Wartefrist (PRD 11). */
export function deleteCouple(coupleId: string): void {
  publish(coupleId, { type: 'room_deleted' })
  db().prepare('DELETE FROM couple WHERE id = ?').run(coupleId)
}

// --- Eigene Namen (PRD F4) --------------------------------------------------

/**
 * Stilvektor eines nicht im Korpus vorhandenen Namens über phonetische
 * Nachbarschaft schätzen (PRD F4).
 *
 * Die fünf phonetisch ähnlichsten Korpusnamen liefern den Vektor, gewichtet
 * nach Ähnlichkeit. `frequency` wird dabei auf „selten" gezogen: ein Name, den
 * die Berliner Standesämter in zwölf Jahren nicht gesehen haben, ist selten.
 */
export function estimateStyleVector(name: string): StyleVector {
  const target = analyze(name)
  const scored = allCandidates()
    .map((c) => ({ c, d: phoneticDistance(target.phoneme_string, c.phoneme_string, target.syllables, c.syllables) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)

  if (!scored.length) return { era: 0.5, softness: 0.5, reach: 0.5, frequency: 0.9, ambiguity: 0.1 }

  const weights = scored.map((s) => 1 / (1 + s.d))
  const total = weights.reduce((a, b) => a + b, 0)
  const acc: StyleVector = { era: 0, softness: 0, reach: 0, frequency: 0, ambiguity: 0 }
  scored.forEach((s, i) => {
    const w = weights[i] / total
    acc.era += s.c.style_vector.era * w
    acc.softness += s.c.style_vector.softness * w
    acc.reach += s.c.style_vector.reach * w
    acc.frequency += s.c.style_vector.frequency * w
    acc.ambiguity += s.c.style_vector.ambiguity * w
  })
  return { ...acc, frequency: Math.max(acc.frequency, 0.8) }
}

/** Levenshtein auf Phonemketten plus Silbendifferenz. */
function phoneticDistance(a: string, b: string, syllablesA: number, syllablesB: number): number {
  const rows = a.length + 1
  const cols = b.length + 1
  let prev = Array.from({ length: cols }, (_, j) => j)
  for (let i = 1; i < rows; i++) {
    const curr = [i]
    for (let j = 1; j < cols; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[cols - 1] + Math.abs(syllablesA - syllablesB) * 1.5
}

export function addCustomName(
  parent: ParentRow,
  name: string,
  gender: 'm' | 'f' | 'neutral' = 'neutral',
): CustomName {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Bitte einen Namen eingeben.')
  if (trimmed.length > 20) throw new Error('Das ist kein Vorname.')

  const id = newId('cst')
  const phonetics = phoneticFields(trimmed)
  const vector = estimateStyleVector(trimmed)
  db()
    .prepare(
      `INSERT INTO custom_name (id, couple_id, added_by_parent_id, name, gender, phonetics, style_vector, nicknames, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      parent.couple_id,
      parent.id,
      trimmed,
      gender,
      JSON.stringify(phonetics),
      JSON.stringify(vector),
      JSON.stringify([]),
      nowIso(),
    )

  // Der Partner erfährt, dass es etwas Neues gibt — aber nicht, was.
  // PRD F4: "ohne Kennzeichnung der Herkunft."
  publish(parent.couple_id, { type: 'custom_name_added' })

  return {
    id,
    couple_id: parent.couple_id,
    added_by_parent_id: parent.id,
    name: trimmed,
    gender,
    style_vector: vector,
    nicknames: [],
    ...phonetics,
  }
}

interface CustomNameRow {
  id: string
  couple_id: string
  added_by_parent_id: string
  name: string
  gender: 'm' | 'f' | 'neutral'
  phonetics: string
  style_vector: string
  nicknames: string
}

export function customCandidates(coupleId: string): NameCandidate[] {
  return toCandidates(
    db().prepare('SELECT * FROM custom_name WHERE couple_id = ?').all(coupleId) as CustomNameRow[],
  )
}

/**
 * Nur die selbst hinzugefügten Namen (PRD F4, „Eigene Liste").
 *
 * Gefiltert in SQL, nicht im Client: die Namen des Partners dürfen gar nicht
 * erst über die Leitung gehen, sonst steht die Herkunft im Netzwerk-Tab.
 */
export function ownCustomCandidates(parent: ParentRow): NameCandidate[] {
  return toCandidates(
    db()
      .prepare('SELECT * FROM custom_name WHERE couple_id = ? AND added_by_parent_id = ? ORDER BY created_at DESC')
      .all(parent.couple_id, parent.id) as CustomNameRow[],
  )
}

function toCandidates(rows: CustomNameRow[]): NameCandidate[] {
  return rows.map((row) => ({
    ref: customRef(row.id),
    name: row.name,
    gender: row.gender,
    origin: null,
    meaning: null,
    style_vector: JSON.parse(row.style_vector) as StyleVector,
    frequency_by_year: {},
    nicknames: JSON.parse(row.nicknames) as string[],
    rhyme_risks: [],
    variants: [],
    ...(JSON.parse(row.phonetics) as Phonetics),
  }))
}

/**
 * Alle bewertbaren Namen eines Raums: Korpus plus die selbst hinzugefügten.
 * Die eigenen Namen des Partners laufen hier ohne jede Markierung mit — genau
 * das ist der Punkt von PRD F4.
 */
export function candidatesFor(coupleId: string): NameCandidate[] {
  return [...allCandidates(), ...customCandidates(coupleId)]
}

export function candidateFor(coupleId: string, ref: string): NameCandidate | undefined {
  return candidateByRef(ref) ?? customCandidates(coupleId).find((c) => c.ref === ref)
}

// --- Bewertungen (PRD 5.3) --------------------------------------------------

export interface RatingRow {
  id: string
  parent_id: string
  name_ref: string
  value: RatingValue
  reason_tag: string | null
  shared_reason: number
  created_at: string
}

export function ratingsOf(parentId: string): RatingRow[] {
  return db()
    .prepare('SELECT * FROM rating WHERE parent_id = ? ORDER BY created_at')
    .all(parentId) as RatingRow[]
}

export function ratingFor(parentId: string, ref: string): RatingRow | undefined {
  return db()
    .prepare('SELECT * FROM rating WHERE parent_id = ? AND name_ref = ?')
    .get(parentId, ref) as RatingRow | undefined
}

export class VetoBudgetError extends Error {
  constructor() {
    super('Keine Vetos mehr übrig.')
    this.name = 'VetoBudgetError'
  }
}

export interface RateResult {
  match: { ref: string; isSuper: boolean } | null
  vetosRemaining: number
}

/**
 * Eine Bewertung speichern und prüfen, ob daraus ein Match wird.
 *
 * Hier greifen zwei Kernprinzipien gleichzeitig:
 * - Ein Nein bleibt unsichtbar (PRD 4.1): der Rückgabewert enthält nie etwas
 *   über die Bewertung des Partners, außer es ist ein beidseitiges Ja.
 * - Ablehnung ist knapp (PRD 4.4): Vetos sind budgetiert.
 */
export function rate(
  parent: ParentRow,
  ref: string,
  value: RatingValue,
  options: { reasonTag?: string | null; sharedReason?: boolean } = {},
): RateResult {
  const database = db()
  const previous = ratingFor(parent.id, ref)

  let vetosRemaining = parent.vetos_remaining
  if (value === 'veto' && previous?.value !== 'veto') {
    if (vetosRemaining <= 0) throw new VetoBudgetError()
    vetosRemaining -= 1
  }
  // Ein Veto zurücknehmen gibt es zurück (PRD 5.3.2).
  if (previous?.value === 'veto' && value !== 'veto') {
    vetosRemaining = Math.min(TUNING.vetos.perParent, vetosRemaining + 1)
  }

  database
    .prepare(
      `INSERT INTO rating (id, parent_id, name_ref, value, reason_tag, shared_reason, created_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (parent_id, name_ref) DO UPDATE SET
         value = excluded.value,
         reason_tag = excluded.reason_tag,
         shared_reason = excluded.shared_reason,
         created_at = excluded.created_at`,
    )
    .run(
      previous?.id ?? newId('rat'),
      parent.id,
      ref,
      value,
      options.reasonTag ?? null,
      options.sharedReason ? 1 : 0,
      nowIso(),
    )

  if (vetosRemaining !== parent.vetos_remaining) {
    database.prepare('UPDATE parent SET vetos_remaining = ? WHERE id = ?').run(vetosRemaining, parent.id)
    // Nur der Zähler wird geteilt, nie der Name (PRD 5.3.2).
    publish(parent.couple_id, {
      type: 'veto_count',
      parentId: parent.id,
      remaining: vetosRemaining,
    })
  }

  refreshProfile(parent.id)

  const match = syncMatch(parent, ref)
  return { match, vetosRemaining }
}

/**
 * Match-Zustand für einen Namen neu bestimmen.
 *
 * Läuft auch beim Zurücknehmen: wer ein `like` auf `pass` ändert, löst das
 * Match auf. Alles andere wäre eine Falle — ein Match, das bleibt, obwohl es
 * niemand mehr trägt.
 */
function syncMatch(parent: ParentRow, ref: string): { ref: string; isSuper: boolean } | null {
  const partner = partnerOf(parent)
  const database = db()
  const existing = database
    .prepare('SELECT * FROM name_match WHERE couple_id = ? AND name_ref = ?')
    .get(parent.couple_id, ref) as { id: string; is_super: number } | undefined

  if (!partner) return null

  const own = ratingFor(parent.id, ref)?.value
  const theirs = ratingFor(partner.id, ref)?.value
  const verdict = evaluateMatch(own, theirs)

  if (!verdict.isMatch) {
    if (existing) database.prepare('DELETE FROM name_match WHERE id = ?').run(existing.id)
    return null
  }

  if (existing) {
    if ((existing.is_super === 1) !== verdict.isSuper) {
      database
        .prepare('UPDATE name_match SET is_super = ? WHERE id = ?')
        .run(verdict.isSuper ? 1 : 0, existing.id)
    }
    return { ref, isSuper: verdict.isSuper }
  }

  database
    .prepare('INSERT INTO name_match (id, couple_id, name_ref, is_super, created_at) VALUES (?,?,?,?,?)')
    .run(newId('mch'), parent.couple_id, ref, verdict.isSuper ? 1 : 0, nowIso())
  publish(parent.couple_id, { type: 'match', ref, isSuper: verdict.isSuper })
  return { ref, isSuper: verdict.isSuper }
}

// --- Profile (PRD 5.2.2) ----------------------------------------------------

export function profileOf(parentId: string): StyleProfile {
  const row = db()
    .prepare('SELECT style_profile, style_confidence FROM parent WHERE id = ?')
    .get(parentId) as { style_profile: string | null; style_confidence: string | null } | undefined
  if (!row?.style_profile || !row.style_confidence) return EMPTY_PROFILE
  return {
    vector: JSON.parse(row.style_profile) as StyleProfile['vector'],
    confidence: JSON.parse(row.style_confidence) as StyleProfile['confidence'],
    sampleSize: countRatings(parentId),
  }
}

export function countRatings(parentId: string): number {
  const row = db().prepare('SELECT COUNT(*) AS n FROM rating WHERE parent_id = ?').get(parentId) as {
    n: number
  }
  return row.n
}

/**
 * Profil nach jedem Swipe fortschreiben (PRD 5.2.2, letzter Absatz).
 * Wird auch beim Abschluss der Kalibrierung benutzt — es ist derselbe Vorgang.
 */
export function refreshProfile(parentId: string): StyleProfile {
  const parent = getParent(parentId)
  const candidates = new Map(candidatesFor(parent.couple_id).map((c) => [c.ref, c]))
  const ratings = ratingsOf(parentId)
    .map((r) => {
      const candidate = candidates.get(r.name_ref)
      return candidate ? { vector: candidate.style_vector, value: r.value } : null
    })
    .filter((r): r is { vector: StyleVector; value: RatingValue } => r !== null)

  const profile = computeProfile(ratings)
  db()
    .prepare('UPDATE parent SET style_profile = ?, style_confidence = ? WHERE id = ?')
    .run(JSON.stringify(profile.vector), JSON.stringify(profile.confidence), parentId)
  return profile
}

/**
 * Kalibrierung abschließen (PRD F2).
 * Das Profil wird erst hier sichtbar — nicht vorher und nicht schrittweise.
 */
export function completeCalibration(parentId: string): StyleProfile {
  const profile = refreshProfile(parentId)
  db().prepare('UPDATE parent SET calibration_complete = 1 WHERE id = ?').run(parentId)
  const parent = getParent(parentId)
  publish(parent.couple_id, { type: 'partner_calibrated' })
  return profile
}

// --- Ableitungen für Deck und Empfehlungen ---------------------------------

export interface RoomState {
  couple: Couple
  parent: ParentRow
  partner: ParentRow | null
  selfProfile: StyleProfile
  partnerProfile: StyleProfile | null
  selfSeenRefs: Set<string>
  partnerSeenRefs: Set<string>
  vetoedRefs: Set<string>
  bothRejectedVectors: StyleVector[]
  candidates: NameCandidate[]
  /** Eigene Namen des Partners, die diese Person noch nicht bewertet hat (PRD F4). */
  priorityRefs: Set<string>
}

export function roomState(parent: ParentRow): RoomState {
  const couple = getCouple(parent.couple_id)
  const partner = partnerOf(parent)
  const candidates = candidatesFor(couple.id)
  const byRef = new Map(candidates.map((c) => [c.ref, c]))

  const own = ratingsOf(parent.id)
  const theirs = partner ? ratingsOf(partner.id) : []

  // Vetos beider Personen entfernen den Namen dauerhaft aus dem Pool beider
  // Personen (PRD 5.3.2) — für die jeweils andere Person unsichtbar (PRD F3).
  const vetoedRefs = new Set(
    [...own, ...theirs].filter((r) => r.value === 'veto').map((r) => r.name_ref),
  )

  const ownRejections = new Set(
    own.filter((r) => r.value === 'pass' || r.value === 'veto').map((r) => r.name_ref),
  )
  const bothRejectedVectors = theirs
    .filter((r) => (r.value === 'pass' || r.value === 'veto') && ownRejections.has(r.name_ref))
    .map((r) => byRef.get(r.name_ref)?.style_vector)
    .filter((v): v is StyleVector => v !== undefined)

  const selfSeenRefs = new Set(own.map((r) => r.name_ref))

  // Alle eigenen Namen des Raums, die diese Person noch nicht bewertet hat —
  // die des Partners **und** die eigenen. Beide brauchen den Vorrang: ohne die
  // des Partners taucht PRD F4 praktisch nie auf, ohne die eigenen kann ein
  // selbst eingetragener Name nie ein Match werden, weil dazu beide Ja sagen
  // müssen (PRD 5.3.4).
  const priorityRefs = new Set(
    customCandidates(couple.id)
      .map((c) => c.ref)
      .filter((ref) => !selfSeenRefs.has(ref) && !vetoedRefs.has(ref)),
  )

  return {
    couple,
    parent,
    partner,
    selfProfile: profileOf(parent.id),
    partnerProfile: partner && partner.calibration_complete === 1 ? profileOf(partner.id) : null,
    selfSeenRefs,
    partnerSeenRefs: new Set(theirs.map((r) => r.name_ref)),
    vetoedRefs,
    bothRejectedVectors,
    candidates,
    priorityRefs,
  }
}

// --- Matches (PRD F5) -------------------------------------------------------

export interface MatchRow {
  id: string
  couple_id: string
  name_ref: string
  is_super: number
  created_at: string
}

export function matchesOf(coupleId: string): MatchRow[] {
  return db()
    .prepare('SELECT * FROM name_match WHERE couple_id = ? ORDER BY is_super DESC, created_at DESC')
    .all(coupleId) as MatchRow[]
}

/**
 * Geteilte Assoziationen (PRD 5.3.3).
 *
 * Nur „erinnert mich an jemanden", nur mit aktiver Zustimmung, und immer ohne
 * den Namen. Der Partner erfährt, dass es einen Namen mit persönlicher
 * Geschichte gibt — nicht welchen.
 */
export function sharedAssociationCount(partnerId: string | null): number {
  if (!partnerId) return 0
  const row = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM rating WHERE parent_id = ? AND shared_reason = 1 AND reason_tag = 'erinnert mich an jemanden'",
    )
    .get(partnerId) as { n: number }
  return row.n
}

// --- Paarvergleich und Shortlist (PRD F7, F9) ------------------------------

export interface EloRow {
  parent_id: string
  name_ref: string
  rating: number
  comparisons: number
}

export function eloOf(parentId: string, refs: string[]): EloRow[] {
  const existing = db()
    .prepare('SELECT * FROM elo_score WHERE parent_id = ?')
    .all(parentId) as EloRow[]
  const byRef = new Map(existing.map((e) => [e.name_ref, e]))
  return refs.map(
    (ref) =>
      byRef.get(ref) ?? {
        parent_id: parentId,
        name_ref: ref,
        rating: TUNING.shortlist.eloStart,
        comparisons: 0,
      },
  )
}

export function saveElo(entries: EloRow[]): void {
  const stmt = db().prepare(
    `INSERT INTO elo_score (parent_id, name_ref, rating, comparisons) VALUES (?,?,?,?)
     ON CONFLICT (parent_id, name_ref) DO UPDATE SET rating = excluded.rating, comparisons = excluded.comparisons`,
  )
  const tx = db().transaction((rows: EloRow[]) => {
    for (const row of rows) stmt.run(row.parent_id, row.name_ref, row.rating, row.comparisons)
  })
  tx(entries)
}

export function recordComparison(parentId: string, a: string, b: string, winner: string): void {
  db()
    .prepare('INSERT INTO comparison (id, parent_id, name_a, name_b, winner, created_at) VALUES (?,?,?,?,?,?)')
    .run(newId('cmp'), parentId, a, b, winner, nowIso())
}

export function comparisonsOf(parentId: string): { name_a: string; name_b: string; winner: string }[] {
  return db()
    .prepare('SELECT name_a, name_b, winner FROM comparison WHERE parent_id = ? ORDER BY created_at')
    .all(parentId) as { name_a: string; name_b: string; winner: string }[]
}

// --- Probewohnen (PRD F8) ---------------------------------------------------

export interface TrialRow {
  id: string
  couple_id: string
  name_ref: string
  start_date: string
  verdict_a: TrialVerdict | null
  verdict_b: TrialVerdict | null
}

export function currentTrial(coupleId: string): TrialRow | null {
  const row = db()
    .prepare('SELECT * FROM trial_week WHERE couple_id = ? ORDER BY start_date DESC LIMIT 1')
    .get(coupleId) as TrialRow | undefined
  return row ?? null
}

export function trialHistory(coupleId: string): TrialRow[] {
  return db()
    .prepare('SELECT * FROM trial_week WHERE couple_id = ? ORDER BY start_date DESC')
    .all(coupleId) as TrialRow[]
}

export function startTrial(coupleId: string, ref: string): TrialRow {
  const id = newId('trl')
  db()
    .prepare('INSERT INTO trial_week (id, couple_id, name_ref, start_date) VALUES (?,?,?,?)')
    .run(id, coupleId, ref, new Date().toISOString().slice(0, 10))
  publish(coupleId, { type: 'trial_updated' })
  return currentTrial(coupleId)!
}

export function setTrialVerdict(coupleId: string, slot: number, verdict: TrialVerdict): TrialRow | null {
  const trial = currentTrial(coupleId)
  if (!trial) return null
  const column = slot === 0 ? 'verdict_a' : 'verdict_b'
  db().prepare(`UPDATE trial_week SET ${column} = ? WHERE id = ?`).run(verdict, trial.id)
  publish(coupleId, { type: 'trial_updated' })
  return currentTrial(coupleId)
}

// --- Spitznamen (PRD F6) ----------------------------------------------------

export function voteNickname(
  parentId: string,
  ref: string,
  nickname: string,
  approves: boolean,
): void {
  db()
    .prepare(
      `INSERT INTO nickname_vote (parent_id, name_ref, nickname, approves) VALUES (?,?,?,?)
       ON CONFLICT (parent_id, name_ref, nickname) DO UPDATE SET approves = excluded.approves`,
    )
    .run(parentId, ref, nickname, approves ? 1 : 0)
}

export function nicknameVotes(
  parent: ParentRow,
  ref: string,
): Record<string, { own: boolean | null; partner: boolean | null }> {
  const rows = db()
    .prepare(
      `SELECT nv.* FROM nickname_vote nv
       JOIN parent p ON p.id = nv.parent_id
       WHERE p.couple_id = ? AND nv.name_ref = ?`,
    )
    .all(parent.couple_id, ref) as { parent_id: string; nickname: string; approves: number }[]

  const out: Record<string, { own: boolean | null; partner: boolean | null }> = {}
  for (const row of rows) {
    const entry = out[row.nickname] ?? { own: null, partner: null }
    if (row.parent_id === parent.id) entry.own = row.approves === 1
    else entry.partner = row.approves === 1
    out[row.nickname] = entry
  }
  return out
}

export function markDivergenceReportShown(coupleId: string): void {
  db().prepare('UPDATE couple SET divergence_report_shown = 1 WHERE id = ?').run(coupleId)
}

export { styleDistance }
