/** Flag-Codes der Klang-Engine. PRD 5.1.2 (mit Score-Einfluss) und 5.1.3 (nur Anzeige). */
export const SOUND_FLAGS = [
  'vowel_clash',
  'consonant_clash',
  'sibilant_overload',
  'rhythm_flat',
  'too_long',
  'alliteration',
  'rhyme',
  'rhythm_good',
  'balance_good',
  'initials_warning',
  'teasing_risk',
  'spelling_friction',
  'sibling_similar',
  'sibling_style_break',
] as const

export type SoundFlagCode = (typeof SOUND_FLAGS)[number]

export type FlagKind = 'penalty' | 'bonus' | 'info'

export interface SoundFlag {
  code: SoundFlagCode
  kind: FlagKind
  /** Kurzlabel fuer Chips im UI */
  label: string
  /**
   * Klartext-Erklaerung mit den konkreten Namen.
   * PRD 5.1.2: "das Flag ist nur informativ und erklärt sich im Klartext".
   */
  explanation: string
  /** Score-Auswirkung; 0 bei reinen Anzeige-Flags */
  delta: number
}

export type Light = 'green' | 'yellow' | 'red'
