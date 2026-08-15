import { NextResponse } from 'next/server'
import { jsonError } from '@/server/api'
import { countRatings, profileOf } from '@/server/repo'
import { requireParent } from '@/server/session'
import { confidentAxes } from '@/lib/style/calibration'
import { profileHeadline, profileStatements, profileSummary } from '@/lib/style/profile'

export const dynamic = 'force-dynamic'

/**
 * Das eigene Stilprofil (PRD S4).
 *
 * Immer nur das eigene. Das Profil des Partners gibt es an keiner Stelle der
 * API — es würde beim nächsten Swipe als Anker wirken (PRD 4.2, Blind zuerst).
 */
export async function GET() {
  try {
    const parent = await requireParent()
    if (parent.calibration_complete !== 1) {
      return NextResponse.json({ error: 'Profil erscheint erst nach der Kalibrierung.' }, { status: 409 })
    }
    const profile = profileOf(parent.id)
    return NextResponse.json({
      vector: profile.vector,
      confidence: profile.confidence,
      confidentAxes: confidentAxes(profile),
      headline: profileHeadline(profile),
      summary: profileSummary(profile),
      statements: profileStatements(profile),
      ratingCount: countRatings(parent.id),
    })
  } catch (error) {
    return jsonError(error)
  }
}
