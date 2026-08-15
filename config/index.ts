import tuning from './tuning.json' with { type: 'json' }

/**
 * Zentrale Tuning-Konfiguration. PRD 14.2 verlangt ausdruecklich, dass die
 * Gewichte der Empfehlungsformel in einer Konfigurationsdatei liegen und nicht
 * im Code. Das gilt hier fuer alle Parameter, die im PRD als Hypothese
 * markiert sind.
 */
export const TUNING = tuning

export type Tuning = typeof tuning
