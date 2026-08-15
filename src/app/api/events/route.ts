import { subscribe, type RoomEvent } from '@/server/events'
import { currentParent } from '@/server/session'

export const dynamic = 'force-dynamic'

/**
 * Server-Sent Events pro Raum (PRD 10, Sync).
 *
 * "Matches müssen ohne App-Neustart erscheinen." Der Stream überträgt
 * ausschließlich Ereignisse, die beide sehen dürfen: Matches, Beitritt,
 * Veto-Zähler. Nie eine Ablehnung, nie einen Namen aus dem Deck des Partners.
 */
export async function GET() {
  const parent = await currentParent()
  if (!parent) return new Response('Keine Sitzung', { status: 401 })

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RoomEvent | { type: 'hello' }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Verbindung ist weg; das Aufräumen erledigt cancel().
        }
      }
      send({ type: 'hello' })
      unsubscribe = subscribe(parent.couple_id, send)
      // Kommentarzeilen halten Proxys davon ab, die Verbindung zu kappen.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          /* ignorieren */
        }
      }, 25_000)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
