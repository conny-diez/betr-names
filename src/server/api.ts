import { NextResponse } from 'next/server'
import { TUNING } from '@config/index'
import { soundScore, type SoundResult } from '@/lib/sound'
import { buildDeck, type DeckCard } from '@/lib/matching/deck'
import { hashSeed } from '@/lib/matching/random'
import type { NameCandidate } from '@/lib/types'
import { UnauthorizedError, type ParentRow } from './session'
import { VetoBudgetError, type Couple, type RoomState } from './repo'

/**
 * Was der Client über einen Namen erfährt.
 *
 * Bewusst ohne jedes Feld, aus dem sich die Bewertung des Partners ableiten
 * ließe. Es gibt keine „vom Partner hinzugefügt"-Markierung (PRD F4) und keine
 * Lücke, wo ein Veto stand (PRD F3).
 */
export interface CardDto {
  ref: string
  name: string
  gender: string
  origin: string | null
  meaning: string | null
  syllables: number
  nicknames: string[]
  variants: string[]
  frequencyByYear: Record<string, number>
  sound: SoundDto
}

export interface SoundDto {
  score: number
  light: SoundResult['light']
  fullName: string
  genitive: string
  flags: { code: string; kind: string; label: string; explanation: string; delta: number }[]
}

export function soundDto(result: SoundResult): SoundDto {
  return {
    score: result.score,
    light: result.light,
    fullName: result.fullName,
    genitive: result.genitive,
    flags: result.flags.map((f) => ({
      code: f.code,
      kind: f.kind,
      label: f.label,
      explanation: f.explanation,
      delta: f.delta,
    })),
  }
}

export function cardDto(candidate: NameCandidate, couple: Couple): CardDto {
  return {
    ref: candidate.ref,
    name: candidate.name,
    gender: candidate.gender,
    origin: candidate.origin,
    meaning: candidate.meaning,
    syllables: candidate.syllables,
    nicknames: candidate.nicknames,
    variants: candidate.variants,
    frequencyByYear: candidate.frequency_by_year,
    sound: soundDto(
      soundScore(candidate.name, couple.surname, {
        siblingNames: couple.siblingNames,
        styleVector: candidate.style_vector,
      }),
    ),
  }
}

/** Deck-Batch für eine Person (PRD F3). */
export function deckFor(state: RoomState, size: number, seedSalt = ''): DeckCard[] {
  return buildDeck({
    candidates: state.candidates,
    surname: state.couple.surname,
    selfProfile: state.selfProfile,
    partnerProfile: state.partnerProfile,
    selfSeenRefs: state.selfSeenRefs,
    partnerSeenRefs: state.partnerSeenRefs,
    vetoedRefs: state.vetoedRefs,
    bothRejectedVectors: state.bothRejectedVectors,
    genderPreference: state.couple.genderPreference,
    siblingNames: state.couple.siblingNames,
    priorityRefs: state.priorityRefs,
    size,
    // Seed aus Raum, Person und Zahl der bisherigen Bewertungen: derselbe
    // Zustand liefert dieselbe Kartenfolge, ein Swipe weiter eine neue.
    seed: hashSeed(`${state.couple.id}:${state.parent.id}:${state.selfSeenRefs.size}:${seedSalt}`),
  })
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Keine Sitzung' }, { status: 401 })
  }
  if (error instanceof VetoBudgetError) {
    return NextResponse.json(
      {
        error: error.message,
        detail: `Jeder hat ${TUNING.vetos.perParent} harte Vetos. Ein bestehendes Veto zurücknehmen gibt eines zurück.`,
      },
      { status: 409 },
    )
  }
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
  return NextResponse.json({ error: message }, { status: 400 })
}

export function publicParent(parent: ParentRow) {
  return {
    id: parent.id,
    displayName: parent.display_name,
    calibrationComplete: parent.calibration_complete === 1,
    vetosRemaining: parent.vetos_remaining,
    slot: parent.slot,
  }
}
