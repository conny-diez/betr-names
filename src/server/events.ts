/**
 * Near-Realtime-Sync zwischen den beiden Geräten (PRD 10).
 *
 * "Matches müssen ohne App-Neustart erscheinen." Umgesetzt als Server-Sent
 * Events über einen In-Memory-Bus pro Raum. Bewusst kein WebSocket und kein
 * externer Broker: es gibt genau zwei Verbindungen pro Raum und keine
 * Nachricht, die der Client zurückschicken müsste.
 *
 * Grenze, offen dokumentiert: der Bus lebt im Prozess. Bei mehreren Instanzen
 * bräuchte es Redis Pub/Sub oder Postgres LISTEN/NOTIFY. Für ein Produkt mit
 * zwei Nutzern pro Raum ist das keine Einschränkung, die früh zieht.
 */

export type RoomEvent =
  | { type: 'match'; ref: string; isSuper: boolean }
  | { type: 'partner_joined'; displayName: string }
  | { type: 'partner_calibrated' }
  | { type: 'veto_count'; parentId: string; remaining: number }
  | { type: 'custom_name_added' }
  | { type: 'surname_changed'; surname: string }
  | { type: 'trial_updated' }
  | { type: 'room_deleted' }

type Listener = (event: RoomEvent) => void

const rooms = new Map<string, Set<Listener>>()

export function subscribe(coupleId: string, listener: Listener): () => void {
  const set = rooms.get(coupleId) ?? new Set<Listener>()
  set.add(listener)
  rooms.set(coupleId, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) rooms.delete(coupleId)
  }
}

export function publish(coupleId: string, event: RoomEvent): void {
  const set = rooms.get(coupleId)
  if (!set) return
  for (const listener of set) {
    try {
      listener(event)
    } catch {
      // Ein abgerissener Client darf den anderen nicht mitreißen.
    }
  }
}
