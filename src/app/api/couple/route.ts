import { NextResponse } from 'next/server'
import { jsonError } from '@/server/api'
import { deleteCouple, getCouple, updateCoupleSettings, updateSurname } from '@/server/repo'
import { clearSession, requireParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Rahmendaten ändern (PRD F1, S13).
 *
 * Der Nachname ist nachträglich änderbar. Es muss dabei nichts migriert
 * werden: Klang-Scores werden zur Laufzeit gerechnet (PRD Kapitel 8), Ratings
 * hängen am Namen, nicht am Score.
 */
export async function PATCH(request: Request) {
  try {
    const parent = await requireParent()
    const body = await request.json()
    if (typeof body.surname === 'string') updateSurname(parent.couple_id, body.surname)
    updateCoupleSettings(parent.couple_id, {
      genderPreference: body.genderPreference,
      siblingNames: body.siblingNames,
      secondaryLanguage: body.secondaryLanguage,
      dueDate: body.dueDate,
    })
    const couple = getCouple(parent.couple_id)
    return NextResponse.json({
      surname: couple.surname,
      genderPreference: couple.genderPreference,
      siblingNames: couple.siblingNames,
      secondaryLanguage: couple.secondaryLanguage,
      dueDate: couple.dueDate,
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * Raum vollständig löschen (PRD 11).
 * Durch jeden Elternteil, ohne Rückfragen, ohne Wartefrist.
 */
export async function DELETE() {
  try {
    const parent = await requireParent()
    deleteCouple(parent.couple_id)
    await clearSession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
