/**
 * Deterministischer Zufall (mulberry32).
 *
 * Das Deck muss reproduzierbar sein: derselbe Zustand plus derselbe Seed ergibt
 * dieselbe Kartenfolge. Sonst laesst sich weder der Regressionstest aus PRD 13
 * schreiben, noch koennte ein abgebrochener Deck-Batch identisch nachgeladen
 * werden.
 */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Stabiler 32-Bit-Hash — erzeugt Seeds aus Raum-/Elternteil-IDs. */
export function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
