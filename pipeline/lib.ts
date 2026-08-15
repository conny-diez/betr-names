import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const RAW = join(ROOT, 'data', 'raw')
export const INTERIM = join(ROOT, 'data', 'interim')
export const CORPUS = join(ROOT, 'data', 'corpus')
export const CURATED = join(ROOT, 'data', 'curated')

/**
 * PRD 9.1, bindende Anweisung 2: Build-Flag `DISTRIBUTION_SAFE`.
 * In Modus A (Eigengebrauch) steht es auf `false`.
 */
export const DISTRIBUTION_SAFE = process.env.DISTRIBUTION_SAFE === 'true'

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function writeJson(path: string, data: unknown): void {
  ensureDir(dirname(path))
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function writeText(path: string, text: string): void {
  ensureDir(dirname(path))
  writeFileSync(path, text, 'utf8')
}

/**
 * Zwischenergebnis eines Pipeline-Schritts.
 * PRD 9.8: "Jeder Schritt ist ein eigenes Skript mit Zwischenergebnis auf der
 * Platte. Kein monolithischer Build."
 */
export function stagePath(stage: string): string {
  return join(INTERIM, `${stage}.json`)
}

export function writeStage(stage: string, data: unknown): void {
  writeJson(stagePath(stage), data)
  log(`→ ${stagePath(stage).replace(ROOT + '/', '')}`)
}

export function readStage<T>(stage: string): T {
  const path = stagePath(stage)
  if (!existsSync(path)) {
    throw new Error(
      `Zwischenergebnis "${stage}" fehlt. Vorherigen Pipeline-Schritt ausführen (siehe README).`,
    )
  }
  return readJson<T>(path)
}

let currentStep = ''

export function step(name: string): void {
  currentStep = name
  process.stdout.write(`\n\x1b[1m[${name}]\x1b[0m\n`)
}

export function log(message: string): void {
  process.stdout.write(`  ${message}\n`)
}

export function warn(message: string): void {
  process.stdout.write(`  \x1b[33m! ${message}\x1b[0m\n`)
}

export function fail(message: string): never {
  process.stdout.write(`  \x1b[31m✗ ${message}\x1b[0m\n`)
  process.exitCode = 1
  throw new Error(`[${currentStep}] ${message}`)
}

/** Minimaler CSV-Parser — die Quelldaten sind bereinigt und ohne Quoting. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return []
  const header = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim()
    })
    return row
  })
}

/**
 * Kanonischer Schluessel eines Namens: kleingeschrieben, Akzente entfernt,
 * Umlaute erhalten. "Anais" und "Anaïs" sind dieselbe Schreibweise,
 * "Sofia" und "Sophia" dagegen nicht — das regelt die Variantentabelle.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFC')
    .replace(/ä/g, '\uE000').replace(/ö/g, '\uE001')
    .replace(/ü/g, '\uE002').replace(/ß/g, '\uE003')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .normalize('NFC')
    .replace(/\uE000/g, 'ä').replace(/\uE001/g, 'ö')
    .replace(/\uE002/g, 'ü').replace(/\uE003/g, 'ß')
    .trim()
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'zwei-listen-corpus-build/0.1 (Namenskorpus, privates Projekt)',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`)
  return res.text()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
