'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { get, type SessionDto } from './api'

export function useSession() {
  const [session, setSession] = useState<SessionDto | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setSession(await get<SessionDto>('/api/session'))
    } catch {
      setSession({ parent: null, partner: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { session, loading, reload }
}

export type RoomEvent = { type: string; [key: string]: unknown }

/**
 * Ereignisse aus dem Raum (PRD 10: Matches ohne App-Neustart).
 *
 * Der Stream trägt nur, was beide sehen dürfen. Der Hook reicht ihn
 * unverändert weiter — jede Filterung passiert serverseitig, damit es nur eine
 * Stelle gibt, an der sie schiefgehen kann.
 */
export function useRoomEvents(onEvent: (event: RoomEvent) => void, enabled = true) {
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!enabled) return
    const source = new EventSource('/api/events')
    source.onmessage = (message) => {
      try {
        handler.current(JSON.parse(message.data) as RoomEvent)
      } catch {
        /* fehlerhafte Nachricht ignorieren */
      }
    }
    source.onerror = () => {
      // EventSource verbindet selbst neu; nichts zu tun.
    }
    return () => source.close()
  }, [enabled])
}

/**
 * Rufprobe (PRD 5.1.4).
 *
 * "Namen werden gelesen entschieden, aber gerufen gelebt." Nutzt die
 * Standard-Sprachausgabe des Betriebssystems mit deutscher Stimme — laut
 * PRD 10 ausdrücklich ausreichend.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    setAvailable(typeof window !== 'undefined' && 'speechSynthesis' in window)
  }, [])

  const speak = useCallback((text: string, calling = false) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'de-DE'
    const german = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'))
    if (german) utterance.voice = german
    // Rufintonation: gedehnt und etwas höher — so, wie man vom Balkon ruft.
    utterance.rate = calling ? 0.75 : 1
    utterance.pitch = calling ? 1.25 : 1
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [])

  return { speak, speaking, available }
}
