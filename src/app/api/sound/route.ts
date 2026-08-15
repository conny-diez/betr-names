import { NextResponse } from 'next/server'
import { jsonError, soundDto } from '@/server/api'
import { soundScore } from '@/lib/sound'
import { estimateStyleVector, getCouple } from '@/server/repo'
import { currentParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Klangbewertung einer freien Eingabe (PRD Phase 1, Prüfkriterium:
 * "Ein Nutzer kann einen Namen eingeben und bekommt eine ehrliche, erklärte
 * Klangbewertung gegen seinen Nachnamen").
 *
 * Funktioniert auch ohne Sitzung, wenn ein Nachname mitgeschickt wird — das
 * macht die Klang-Engine allein prüfbar, ohne Raum und ohne Partner.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const firstName = String(body.firstName ?? '').trim()
    if (!firstName) throw new Error('Bitte einen Vornamen eingeben.')

    const parent = await currentParent()
    const couple = parent ? getCouple(parent.couple_id) : null
    const surname = String(body.surname ?? couple?.surname ?? '').trim()

    // PRD 4.3: "Kein Name wird jemals ohne Nachnamen angezeigt."
    if (!surname) throw new Error('Ohne Nachnamen gibt es keine Klangbewertung.')

    const result = soundScore(firstName, surname, {
      siblingNames: couple?.siblingNames ?? [],
      styleVector: estimateStyleVector(firstName),
    })
    return NextResponse.json({ sound: soundDto(result) })
  } catch (error) {
    return jsonError(error)
  }
}
