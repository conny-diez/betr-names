import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Datenhaltung nach PRD Kapitel 8.
 *
 * SQLite, weil das Produkt pro Raum genau zwei Menschen bedient und die
 * gesamte Datenmenge eines Paares in wenige Kilobyte passt. Ein Datenbankserver
 * wäre hier reine Betriebslast.
 *
 * **Berechnete Werte werden nicht gespeichert** (PRD Kapitel 8, Schluss):
 * Klang-Score, Flags und Empfehlungsranking entstehen zur Laufzeit. Deshalb
 * muss beim Ändern des Nachnamens nichts migriert werden — der Testfall aus
 * PRD 13 ist damit strukturell erfüllt, nicht durch eine Migrationsroutine.
 */

const DB_PATH = process.env.ZWEI_LISTEN_DB ?? join(process.cwd(), 'data', 'app.sqlite')

let instance: Database.Database | null = null

export function db(): Database.Database {
  if (instance) return instance
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const database = new Database(DB_PATH)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  migrate(database)
  instance = database
  return database
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS couple (
      id                       TEXT PRIMARY KEY,
      invite_code              TEXT NOT NULL UNIQUE,
      surname                  TEXT NOT NULL,
      surname_phonetics        TEXT NOT NULL,
      due_date                 TEXT,
      gender_preference        TEXT NOT NULL DEFAULT 'open',
      sibling_names            TEXT NOT NULL DEFAULT '[]',
      secondary_language       TEXT,
      created_at               TEXT NOT NULL,
      -- PRD 5.3.5: der Divergenz-Report erscheint genau einmal
      divergence_report_shown  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS parent (
      id                    TEXT PRIMARY KEY,
      couple_id             TEXT NOT NULL REFERENCES couple(id) ON DELETE CASCADE,
      display_name          TEXT NOT NULL,
      device_token          TEXT,
      style_profile         TEXT,
      style_confidence      TEXT,
      calibration_complete  INTEGER NOT NULL DEFAULT 0,
      vetos_remaining       INTEGER NOT NULL DEFAULT 5,
      slot                  INTEGER NOT NULL,
      created_at            TEXT NOT NULL,
      UNIQUE (couple_id, slot)
    );

    CREATE TABLE IF NOT EXISTS custom_name (
      id                  TEXT PRIMARY KEY,
      couple_id           TEXT NOT NULL REFERENCES couple(id) ON DELETE CASCADE,
      added_by_parent_id  TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
      name                TEXT NOT NULL,
      gender              TEXT NOT NULL DEFAULT 'neutral',
      phonetics           TEXT NOT NULL,
      style_vector        TEXT NOT NULL,
      nicknames           TEXT NOT NULL DEFAULT '[]',
      created_at          TEXT NOT NULL,
      UNIQUE (couple_id, name)
    );

    CREATE TABLE IF NOT EXISTS rating (
      id             TEXT PRIMARY KEY,
      parent_id      TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
      name_ref       TEXT NOT NULL,
      value          TEXT NOT NULL CHECK (value IN ('love','like','pass','veto')),
      reason_tag     TEXT,
      shared_reason  INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL,
      UNIQUE (parent_id, name_ref)
    );
    CREATE INDEX IF NOT EXISTS rating_by_ref ON rating (name_ref);

    -- "match" ist in SQLite ein Operator-Schlüsselwort, daher name_match.
    CREATE TABLE IF NOT EXISTS name_match (
      id          TEXT PRIMARY KEY,
      couple_id   TEXT NOT NULL REFERENCES couple(id) ON DELETE CASCADE,
      name_ref    TEXT NOT NULL,
      is_super    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      UNIQUE (couple_id, name_ref)
    );

    CREATE TABLE IF NOT EXISTS elo_score (
      parent_id    TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
      name_ref     TEXT NOT NULL,
      rating       REAL NOT NULL DEFAULT 1500,
      comparisons  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (parent_id, name_ref)
    );

    CREATE TABLE IF NOT EXISTS comparison (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
      name_a      TEXT NOT NULL,
      name_b      TEXT NOT NULL,
      winner      TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trial_week (
      id          TEXT PRIMARY KEY,
      couple_id   TEXT NOT NULL REFERENCES couple(id) ON DELETE CASCADE,
      name_ref    TEXT NOT NULL,
      start_date  TEXT NOT NULL,
      verdict_a   TEXT,
      verdict_b   TEXT
    );

    -- Spitznamen werden getrennt vom Namen abgestimmt (PRD F6).
    CREATE TABLE IF NOT EXISTS nickname_vote (
      parent_id  TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
      name_ref   TEXT NOT NULL,
      nickname   TEXT NOT NULL,
      approves   INTEGER NOT NULL,
      PRIMARY KEY (parent_id, name_ref, nickname)
    );
  `)
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

/**
 * Einladungscode statt Accountpflicht (PRD 10, Auth: leichtgewichtig).
 * Ohne I, O, 0, 1 — der Code wird laut vorgelesen.
 */
export function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function nowIso(): string {
  return new Date().toISOString()
}
