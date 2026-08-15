'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import type { SoundDto } from '@/lib/client/api'
import { useSpeech } from '@/lib/client/hooks'

export function Screen({
  title,
  subtitle,
  children,
  footer,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="shell">
      <main className="flex-1 px-5 pt-8 pb-6">
        {title && (
          <header className="mb-6">
            <h1 className="display-name text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-ink-soft leading-relaxed">{subtitle}</p>}
          </header>
        )}
        {children}
      </main>
      {footer}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  const styles = {
    primary: 'bg-ink text-paper hover:bg-ink-soft',
    quiet: 'bg-accent-soft text-ink hover:bg-line',
    ghost: 'text-ink-soft hover:text-ink',
  }[variant]
  return (
    <button
      {...props}
      className={`rounded-full px-5 py-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-2 text-xs text-ink-faint leading-relaxed">{hint}</p>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line bg-paper-raised px-4 py-3 text-base text-ink outline-none transition-colors focus:border-line-strong'

export function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
        tone === 'warn' ? 'bg-light-red-bg text-light-red' : 'bg-accent-soft text-ink-soft'
      }`}
    >
      {children}
    </div>
  )
}

/**
 * Die Klang-Ampel (PRD 5.1.2).
 *
 * Bewusst entsättigt. Rot heißt hier "reibt sich", nicht "verboten" — rot ist
 * nie ein Ausschluss.
 */
export function SoundLight({ sound, compact = false }: { sound: SoundDto; compact?: boolean }) {
  const map = {
    green: { bg: 'bg-light-green-bg', fg: 'text-light-green', label: 'klingt zusammen' },
    yellow: { bg: 'bg-light-yellow-bg', fg: 'text-light-yellow', label: 'geht, mit einer Kante' },
    red: { bg: 'bg-light-red-bg', fg: 'text-light-red', label: 'reibt sich' },
  }[sound.light]

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${map.bg} ${map.fg}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {compact ? sound.score : map.label}
    </span>
  )
}

/** Rufprobe (PRD 5.1.4) — im MVP, nicht als Nice-to-have. */
export function CallTest({ fullName }: { fullName: string }) {
  const { speak, speaking, available } = useSpeech()
  if (!available) return null
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => speak(fullName)}
        className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-line-strong"
        aria-label={`${fullName} vorlesen`}
      >
        <SpeakerIcon active={speaking} />
        sprechen
      </button>
      <button
        type="button"
        onClick={() => speak(fullName, true)}
        className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-line-strong"
      >
        rufen
      </button>
    </div>
  )
}

function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 6v4h2.5L9 13V3L5.5 6H3Z" strokeLinejoin="round" />
      {active && <path d="M11 5.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />}
    </svg>
  )
}

const NAV = [
  { href: '/deck', label: 'Deck' },
  { href: '/matches', label: 'Matches' },
  { href: '/liste', label: 'Liste' },
  { href: '/shortlist', label: 'Shortlist' },
  { href: '/einstellungen', label: 'Mehr' },
]

export function Nav() {
  const pathname = usePathname()
  return (
    <nav className="sticky bottom-0 border-t border-line bg-paper/90 backdrop-blur">
      <ul className="flex">
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 py-3 text-[11px] transition-colors ${
                  active ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                <span
                  className={`h-0.5 w-6 rounded-full transition-colors ${
                    active ? 'bg-ink' : 'bg-transparent'
                  }`}
                />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function Spinner({ label = 'Einen Moment' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-ink-faint">{label}…</div>
  )
}
