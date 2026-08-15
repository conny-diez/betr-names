'use client'

/** Typen, die zwischen Server-Routen und UI geteilt werden. */
export interface SoundFlagDto {
  code: string
  kind: string
  label: string
  explanation: string
  delta: number
}

export interface SoundDto {
  score: number
  light: 'green' | 'yellow' | 'red'
  fullName: string
  genitive: string
  flags: SoundFlagDto[]
}

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
  source?: 'corpus' | 'bridge' | 'divergence'
}

export interface SessionDto {
  parent: {
    id: string
    displayName: string
    calibrationComplete: boolean
    vetosRemaining: number
    slot: number
  } | null
  partner: SessionDto['parent']
  couple?: {
    id: string
    inviteCode: string
    surname: string
    genderPreference: 'male' | 'female' | 'open'
    siblingNames: string[]
    secondaryLanguage: string | null
    dueDate: string | null
    divergenceReportShown: boolean
  }
  ratingCount?: number
  partnerSharedAssociations?: number
  corpus?: { count: number; builtAt: string; distributionSafe: boolean }
}

export class ApiError extends Error {
  status: number
  detail?: string
  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new ApiError(data.error ?? 'Etwas ist schiefgegangen.', response.status, data.detail)
  }
  return data as T
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })
