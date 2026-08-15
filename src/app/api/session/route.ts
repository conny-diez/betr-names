import { NextResponse } from 'next/server'
import { jsonError, publicParent } from '@/server/api'
import { corpusMeta } from '@/server/corpus'
import {
  countRatings,
  createCouple,
  getCouple,
  joinCouple,
  partnerOf,
  sharedAssociationCount,
} from '@/server/repo'
import { clearSession, currentParent, setSession } from '@/server/session'

export const dynamic = 'force-dynamic'

/** Wer bin ich, mit wem, und wie weit sind wir? */
export async function GET() {
  const parent = await currentParent()
  if (!parent) return NextResponse.json({ parent: null })
  const couple = getCouple(parent.couple_id)
  const partner = partnerOf(parent)
  return NextResponse.json({
    parent: publicParent(parent),
    partner: partner ? publicParent(partner) : null,
    couple: {
      id: couple.id,
      inviteCode: couple.inviteCode,
      surname: couple.surname,
      genderPreference: couple.genderPreference,
      siblingNames: couple.siblingNames,
      secondaryLanguage: couple.secondaryLanguage,
      dueDate: couple.dueDate,
      divergenceReportShown: couple.divergenceReportShown,
    },
    ratingCount: countRatings(parent.id),
    // Nur die Zahl, nie der Name (PRD 5.3.3).
    partnerSharedAssociations: sharedAssociationCount(partner?.id ?? null),
    corpus: corpusMeta(),
  })
}

/** Raum anlegen (PRD F1). */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { couple, parent } = createCouple({
      surname: String(body.surname ?? ''),
      displayName: String(body.displayName ?? ''),
      genderPreference: body.genderPreference,
      siblingNames: Array.isArray(body.siblingNames) ? body.siblingNames : [],
      secondaryLanguage: body.secondaryLanguage ?? null,
      dueDate: body.dueDate ?? null,
    })
    await setSession(parent.id)
    return NextResponse.json({ inviteCode: couple.inviteCode, parent: publicParent(parent) })
  } catch (error) {
    return jsonError(error)
  }
}

/** Beitreten (PRD F1). */
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const parent = joinCouple(String(body.code ?? ''), String(body.displayName ?? ''))
    await setSession(parent.id)
    return NextResponse.json({ parent: publicParent(parent) })
  } catch (error) {
    return jsonError(error)
  }
}

/** Abmelden. Löscht nur die Sitzung, nicht den Raum. */
export async function DELETE() {
  await clearSession()
  return NextResponse.json({ ok: true })
}
