import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],

  /**
   * Das Produkt wird zu zweit auf zwei Geräten benutzt (PRD 3). Zum Testen
   * heißt das: der Dev-Server muss aus dem lokalen Netz erreichbar sein.
   * Next blockiert Dev-Ressourcen für fremde Origins sonst — die Seite lädt
   * dann kein Client-JS und bleibt beim Ladezustand stehen.
   *
   * Gilt nur für `next dev`. Im Produktionsbetrieb hat diese Option keine
   * Wirkung.
   */
  allowedDevOrigins: ['192.168.178.*', '10.*', '172.16.*', '*.local'],
}

export default nextConfig
