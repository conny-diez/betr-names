import { NextResponse } from 'next/server'
import { jsonError } from '@/server/api'
import { divergenceReport } from '@/lib/matching/divergence'
import { getCouple, markDivergenceReportShown, partnerOf, profileOf } from '@/server/repo'
import { requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Divergenz-Report (PRD 5.3.5, S12).
 *
 * Erscheint genau einmal, wenn die Profil-Distanz den Schwellwert übersteigt.
 * Neutral formuliert, ohne Wertung, **ohne Kompatibilitäts-Prozentzahl** —
 * letzteres wäre Beziehungsbewertung, nicht Namenssuche (PRD 7).
 *
 * Der Report ist die einzige Stelle, an der etwas über den Geschmack des
 * Partners sichtbar wird. Das ist zulässig, weil er über Muster spricht und
 * nie über einzelne Namen.
 */
export async function GET() {
  try {
    const parent = await requireParent()
    const couple = getCouple(parent.couple_id)
    const partner = partnerOf(parent)

    if (!partner || partner.calibration_complete !== 1 || parent.calibration_complete !== 1) {
      return NextResponse.json({ available: false, reason: 'Beide müssen kalibriert sein.' })
    }

    const report = divergenceReport(profileOf(parent.id), profileOf(partner.id), {
      a: 'Du',
      b: partner.display_name,
    })

    return NextResponse.json({
      available: true,
      triggered: report.triggered,
      alreadyShown: couple.divergenceReportShown,
      intro: report.intro,
      lines: report.lines,
      // Absichtlich keine Prozentzahl, nur die Rohdistanz für interne Zwecke.
      distance: Number(report.distance.toFixed(3)),
    })
  } catch (error) {
    return jsonError(error)
  }
}

/** Als gesehen markieren — damit er wirklich nur einmal erscheint. */
export async function POST() {
  try {
    const parent = await requireParent()
    markDivergenceReportShown(parent.couple_id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
