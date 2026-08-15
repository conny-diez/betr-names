import { cookies } from 'next/headers'
import { db } from './db'

/**
 * Leichtgewichtige Sitzung ohne Accountpflicht (PRD 10).
 *
 * Ein httpOnly-Cookie mit der Parent-ID reicht: es gibt nichts zu schützen,
 * das nicht auch der Partner sehen dürfte — außer den eigenen Ablehnungen, und
 * die verlassen den Server ohnehin nie in identifizierbarer Form (PRD 11).
 */

const COOKIE = 'zwei_listen_parent'
const ONE_YEAR = 60 * 60 * 24 * 365

export interface ParentRow {
  id: string
  couple_id: string
  display_name: string
  device_token: string | null
  style_profile: string | null
  style_confidence: string | null
  calibration_complete: number
  vetos_remaining: number
  slot: number
  created_at: string
}

export async function setSession(parentId: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE, parentId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}

export async function currentParent(): Promise<ParentRow | null> {
  const store = await cookies()
  const id = store.get(COOKIE)?.value
  if (!id) return null
  const row = db().prepare('SELECT * FROM parent WHERE id = ?').get(id) as ParentRow | undefined
  return row ?? null
}

/** Für Routen, die ohne Sitzung nichts tun können. */
export async function requireParent(): Promise<ParentRow> {
  const parent = await currentParent()
  if (!parent) throw new UnauthorizedError()
  return parent
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Keine Sitzung')
    this.name = 'UnauthorizedError'
  }
}
