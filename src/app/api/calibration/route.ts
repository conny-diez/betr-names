import { NextResponse } from 'next/server'
import { cardDto, jsonError } from '@/server/api'
import { calibrationSet } from '@/server/corpus'
import { completeCalibration, getCouple, ratingsOf } from '@/server/repo'
import { profileSummary, profileHeadline, profileStatements } from '@/lib/style/profile'
import { requireParent } from '@/server/session'
import { TUNING } from '@config/index'

export const dynamic = 'force-dynamic'

/**
 * Das feste Kalibrierungs-Set (PRD F2).
 *
 * Unterbrechbar und wiederaufnehmbar: bereits bewertete Karten fallen raus,
 * die Reihenfolge der übrigen bleibt.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const rated = new Set(ratingsOf(parent.id).map((r) => r.name_ref))
    const set = calibrationSet()
    const remaining = set.filter((c) => !rated.has(c.ref))

    return NextResponse.json({
      total: set.length,
      done: set.length - remaining.length,
      complete: parent.calibration_complete === 1,
      cards: remaining.map((c) => cardDto(c, couple)),
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * Kalibrierung abschließen — und erst jetzt das Profil zeigen.
 *
 * PRD F2: "Das Profil erscheint erst nach dem 20. Swipe, nicht vorher und
 * nicht schrittweise." Deshalb prüft der Server das nach, statt sich auf den
 * Client zu verlassen.
 */
export async function POST() {
  try {
    const parent = await requireParent()
    const rated = new Set(ratingsOf(parent.id).map((r) => r.name_ref))
    const set = calibrationSet()
    const done = set.filter((c) => rated.has(c.ref)).length

    if (done < TUNING.calibration.setSize) {
      return NextResponse.json(
        { error: 'Kalibrierung noch nicht abgeschlossen.', done, total: set.length },
        { status: 409 },
      )
    }

    const profile = completeCalibration(parent.id)
    return NextResponse.json({
      profile: profile.vector,
      confidence: profile.confidence,
      headline: profileHeadline(profile),
      summary: profileSummary(profile),
      statements: profileStatements(profile),
    })
  } catch (error) {
    return jsonError(error)
  }
}
