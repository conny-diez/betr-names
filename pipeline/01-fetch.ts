/**
 * Schritt 1 — fetch: Rohdaten je Stadt herunterladen, mit source_id + license taggen.
 *
 * PRD 9: "Der Namenskorpus wird nicht zur Laufzeit abgefragt, sondern einmalig
 * gebaut." Alles, was hier landet, ist ab hier offline reproduzierbar.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAW, ensureDir, fetchText, log, step, warn, writeJson, writeText } from './lib.ts'
import { SOURCES } from './sources.ts'

const REPO = 'berlin/haeufige-vornamen-berlin'
const BRANCH = 'main'

interface TreeEntry {
  path: string
  type: string
}

export interface RawFile {
  source_id: string
  license: string
  /** Pfad relativ zu data/raw */
  path: string
  year: number
  district: string
  url: string
}

async function fetchBerlin(force: boolean): Promise<RawFile[]> {
  const treeUrl = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
  const tree = JSON.parse(await fetchText(treeUrl)) as { tree: TreeEntry[] }

  const csvs = tree.tree
    .filter((t) => t.type === 'blob' && /^data\/\d{4}\/.+\.csv$/.test(t.path))
    .map((t) => t.path)
    .sort()

  log(`${csvs.length} CSV-Dateien im Repository ${REPO}`)

  const source = SOURCES['berlin-vornamen']
  const files: RawFile[] = []
  let downloaded = 0

  for (const path of csvs) {
    const [, year, file] = path.split('/')
    const district = file.replace(/\.csv$/, '')
    const target = join(RAW, 'berlin', year, file)
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`

    if (!existsSync(target) || force) {
      writeText(target, await fetchText(url))
      downloaded++
    }
    files.push({
      source_id: source.id,
      license: source.license,
      path: join('berlin', year, file),
      year: Number(year),
      district,
      url,
    })
  }

  // Berlin dokumentiert das Muell-Problem und pflegt eine Liste der Eintraege,
  // die keine Namen sind. PRD 9.3.1: "als Referenz für die eigenen Filter nutzen".
  const nonNamesTarget = join(RAW, 'berlin', 'non_names.txt')
  if (!existsSync(nonNamesTarget) || force) {
    writeText(
      nonNamesTarget,
      await fetchText(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/conf/non_names.txt`),
    )
    log('Berliner Nicht-Namen-Liste geladen (conf/non_names.txt)')
  }

  log(`${downloaded} neu geladen, ${files.length - downloaded} aus dem Cache`)
  return files
}

async function main(): Promise<void> {
  step('1 fetch')
  ensureDir(RAW)
  const force = process.argv.includes('--force')

  const files: RawFile[] = []

  try {
    files.push(...(await fetchBerlin(force)))
  } catch (error) {
    const cached = join(RAW, 'manifest.json')
    if (existsSync(cached)) {
      warn(`Berlin nicht erreichbar (${(error as Error).message}) — nutze vorhandenen Cache`)
      const manifest = JSON.parse(readFileSync(cached, 'utf8')) as { files: RawFile[] }
      files.push(...manifest.files)
    } else {
      throw error
    }
  }

  for (const id of Object.keys(SOURCES)) {
    if (SOURCES[id].status === 'planned') {
      warn(`Quelle "${id}" ist registriert, aber noch nicht angebunden (siehe README)`)
    }
  }

  writeJson(join(RAW, 'manifest.json'), {
    fetched_at: new Date().toISOString(),
    files,
  })
  log(`${files.length} Dateien im Manifest`)
}

await main()
