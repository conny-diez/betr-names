import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zwei Listen',
  description:
    'Namensfinder für werdende Eltern. Getrennt bewerten, nur Übereinstimmungen sehen, den Nachnamen immer mitdenken.',
  // Kein Teilen, kein Vorschaubild, keine Indexierung: das hier ist ein
  // privater Raum zwischen zwei Menschen (PRD 2, Nicht-Ziele; PRD 11).
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#faf7f2',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
