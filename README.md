# Betr Names

Namensfinder für werdende Eltern. Zwei Personen, ein gemeinsamer Raum, zwei
Geräte: jeder bewertet Namen für sich, sichtbar wird ausschließlich die
Übereinstimmung.

> Dieses Produkt sucht keine Namen. Es moderiert eine Verhandlung zwischen zwei
> Menschen, die sich nicht wehtun wollen.

## Kernfunktionen

- **Klang-Engine** — jeder Vorname wird gegen den Nachnamen geprüft, mit
  Score, Ampel und Erklärung im Klartext („zwei Vokale treffen aufeinander —
  beim Sprechen verschmilzt das zu ‚MiaAhrens'"). Der Nachname ist ab der
  ersten Karte dabei.
- **Blinde Bewertung** — keiner sieht die Bewertung des anderen, bevor er
  selbst bewertet hat. Ablehnungen bleiben dauerhaft unsichtbar.
- **Begrenzte Vetos** — fünf harte Vetos pro Person. Der Partner sieht nur den
  Zähler, nie den Namen. Das macht aus einer Kränkung eine
  Ressourcenentscheidung.
- **Brückennamen** — die Empfehlung sucht Namen zwischen beiden Stilprofilen,
  die noch keiner gesehen hat, plus 15 % bewusste Ausreißer gegen die
  Konvergenz des Decks.
- **Divergenz-Report** — liegen die Geschmäcker weit auseinander, benennt das
  Werkzeug einmalig die Muster. Neutral, ohne Wertung, ohne
  Kompatibilitäts-Prozentzahl.
- **Rufprobe, Spitznamen, Probewohnen** — Namen werden gelesen entschieden,
  aber gerufen gelebt. Sprachausgabe, Kurzformen zur Abstimmung, und ein „Name
  der Woche", den die App danach beiläufig in ihren eigenen Texten benutzt.
- **Eigener Korpus** — 3.001 Namen, gebaut aus den echten Vornamenslisten der
  Berliner Standesämter 2012–2023.

---

## Inhalt

- [Tech-Stack](#tech-stack)
- [Voraussetzungen](#voraussetzungen)
- [Erste Schritte](#erste-schritte)
- [Auf zwei Geräten testen](#auf-zwei-geräten-testen)
- [Architektur](#architektur)
  - [Verzeichnisstruktur](#verzeichnisstruktur)
  - [Ablauf einer Anfrage](#ablauf-einer-anfrage)
  - [Die drei Engines](#die-drei-engines)
  - [Datenbankschema](#datenbankschema)
  - [API-Routen](#api-routen)
  - [Echtzeit-Sync](#echtzeit-sync)
- [Der Namenskorpus](#der-namenskorpus)
- [Umgebungsvariablen](#umgebungsvariablen)
- [Verfügbare Befehle](#verfügbare-befehle)
- [Tests](#tests)
- [Deployment](#deployment)
- [Entscheidungen zu den offenen Fragen](#entscheidungen-zu-den-offenen-fragen-prd-kapitel-14)
- [Abweichungen vom PRD](#abweichungen-vom-prd)
- [Was während der Umsetzung auffiel](#was-während-der-umsetzung-auffiel)
- [Bekannte Lücken](#bekannte-lücken)
- [Fehlersuche](#fehlersuche)
- [Datenschutz](#datenschutz)

---

## Tech-Stack

| Bereich | Wahl | Warum |
|---|---|---|
| **Sprache** | TypeScript 7 (strict) | — |
| **Framework** | Next.js 16 (App Router, Turbopack) | Mobile-First-Web-App laut PRD 10 |
| **UI** | React 19, Tailwind CSS 4 | — |
| **Datenbank** | SQLite via `better-sqlite3` 13 | Ein Raum sind zwei Menschen und wenige Kilobyte. Ein Datenbankserver wäre reine Betriebslast. |
| **Sync** | Server-Sent Events | Zwei Verbindungen pro Raum, keine Nachricht zurück — ein WebSocket wäre Overhead |
| **Auth** | Einladungscode + httpOnly-Cookie | PRD 10: leichtgewichtig, keine Accountpflicht |
| **Sprachausgabe** | Web Speech API (Betriebssystem-TTS) | PRD 10: deutsche Standardstimme reicht |
| **Build-Pipeline** | eigenständige `tsx`-Skripte | PRD 9.8: kein monolithischer Build |
| **Tests** | `node:test` | keine zusätzliche Abhängigkeit nötig |
| **Deployment** | nicht konfiguriert | siehe [Deployment](#deployment) |

Bewusst **nicht** verwendet: ORM (das Schema hat neun Tabellen und ändert sich
nicht), State-Management-Bibliothek (der Server ist die Wahrheit), UI-Bibliothek
(vier eigene Komponenten reichen), LLM zur Laufzeit (PRD 9.6 verbietet es
ausdrücklich).

## Voraussetzungen

- **Node.js 20 oder neuer.** Entwickelt und getestet mit 24.14.1.
  `better-sqlite3` bringt vorkompilierte Binaries für gängige Plattformen mit;
  bei exotischen Systemen wird es beim `npm install` aus dem Quelltext gebaut
  und braucht dafür eine C++-Toolchain (`xcode-select --install` auf macOS,
  `build-essential` unter Debian/Ubuntu).
- **npm 10 oder neuer.** Im Repo liegt eine `package-lock.json`.
- **Kein Datenbankserver.** SQLite legt die Datei selbst an.
- **Internetzugang nur für den Korpus-Build.** Die App selbst läuft offline;
  `npm run corpus:build` lädt die Berliner Standesamtsdaten und fragt Wikidata
  ab.

## Erste Schritte

### 1. Repository klonen und Abhängigkeiten installieren

```bash
git clone <repo-url> betr-names
cd betr-names
npm install
```

### 2. Korpus prüfen

Der fertige Korpus ist eingecheckt — für einen reinen App-Lauf ist nichts weiter
zu tun:

```bash
ls -lh data/corpus/names.json    # ~4,6 MB, 3.001 Namen
```

Fehlt die Datei, startet die App nicht und meldet
`Korpus fehlt. Erst npm run corpus:build ausführen`. Dann:

```bash
npm run corpus:build             # ~5 Minuten, braucht Internet
```

### 3. Entwicklungsserver starten

```bash
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000).

Beim ersten Aufruf legt SQLite `data/app.sqlite` an. Es gibt keine Migration
und keinen Seed-Schritt — das Schema wird beim ersten Zugriff erzeugt
(`src/server/db.ts`).

### 4. Durch den Ablauf gehen

1. **Raum anlegen** → Nachname eingeben. Er ist Pflichtfeld; während der
   Eingabe siehst du sofort, wie „Mia" und „Ferdinand" dagegen klingen.
2. Du bekommst einen **sechsstelligen Einladungscode**.
3. **Kalibrierung**: 20 handkuratierte Namen durchswipen. Danach erscheint dein
   Stilprofil — vorher nicht und nicht schrittweise.
4. **Deck**: die Kernschleife. Wisch nach rechts für „gefällt mir", nach oben
   für „Favorit", nach links für „eher nicht", langer Druck für ein Veto.
5. Sobald der Partner beigetreten ist und ebenfalls kalibriert hat, entstehen
   **Matches** und **Brückenvorschläge**.

### 5. Alles verifizieren

```bash
npm run typecheck    # tsc --noEmit
npm test             # 52 Tests
npm run build        # Produktionsbuild
```

## Auf zwei Geräten testen

Das Produkt ergibt erst zu zweit Sinn. Der Entwicklungsserver muss dafür aus
dem lokalen Netz erreichbar sein:

```bash
npx next dev -H 0.0.0.0 -p 3000
```

Die eigene LAN-Adresse ermitteln:

```bash
ipconfig getifaddr en0        # macOS
hostname -I | awk '{print $1}' # Linux
```

Beide Geräte öffnen dann `http://<LAN-IP>:3000`. Gerät A legt den Raum an,
Gerät B tritt mit dem Code bei.

**Wichtig:** Next.js blockiert Entwicklungs-Ressourcen für fremde Origins.
`next.config.ts` erlaubt deshalb die üblichen privaten Netzbereiche über
`allowedDevOrigins`. Ohne diesen Eintrag lädt kein Client-JavaScript und die
Seite bleibt beim Ladezustand stehen — siehe [Fehlersuche](#fehlersuche).

Auf **einem** Gerät testen: die Sitzung hängt an einem Cookie pro Browserprofil.
Zwei Tabs desselben Browsers sind dieselbe Person; nimm ein privates Fenster
oder einen zweiten Browser.

Frischer Raum:

```bash
rm -f data/app.sqlite data/app.sqlite-wal data/app.sqlite-shm
```

---

## Architektur

### Verzeichnisstruktur

```
├── config/
│   ├── tuning.json            # Alle Parameter, die das PRD als Hypothese markiert
│   └── index.ts               # Typisierter Zugriff darauf
├── data/
│   ├── corpus/                # Auslieferungsartefakt (eingecheckt)
│   │   ├── names.json         #   3.001 Namen mit allen Attributen
│   │   └── ATTRIBUTIONS.md    #   generiert, nicht von Hand gepflegt
│   ├── curated/               # Handkuratierte Tabellen (eingecheckt)
│   │   ├── calibration-set.json     # die 20 Kalibrierungsnamen
│   │   ├── nicknames.json           # Spitznamen-Mapping (kein Raten)
│   │   ├── rhyme-risks.json         # Hänsel-Reime, bewusst sparsam
│   │   ├── spelling-variants.json   # Sofia/Sophia, Mia/Mya
│   │   ├── stress-overrides.json    # Betonung, wo die Heuristik danebenliegt
│   │   ├── style-overrides.json     # manuelle Prüfung der Top 200
│   │   ├── meanings.json            # selbst formulierte Bedeutungstexte
│   │   └── initials-blacklist.json  # ASS, KZ, HIV …
│   ├── raw/                   # Rohdaten der Quellen (gitignored)
│   ├── interim/               # Zwischenergebnisse der Pipeline (gitignored)
│   └── app.sqlite             # Laufzeitdaten (gitignored)
├── pipeline/                  # Korpus-Build, neun Schritte
│   ├── sources.ts             #   Quellenregister mit Lizenzen
│   ├── lib.ts                 #   IO, CSV, DISTRIBUTION_SAFE
│   ├── 01-fetch.ts … 09-export.ts
│   └── run-all.ts             #   ruft die Schritte der Reihe nach auf
├── src/
│   ├── lib/                   # Reine Logik, ohne Server- oder React-Bezug
│   │   ├── types.ts           #   gemeinsame Typen (PRD Kapitel 8)
│   │   ├── phonetics/         #   G2P-Regeln, Silben, Betonung
│   │   │   ├── g2p.ts         #     Graphem → Phonem, deutsche Regeltabelle
│   │   │   ├── syllables.ts   #     Silbentrennung, Betonungsmuster, Reim
│   │   │   ├── inventory.ts   #     vereinfachtes IPA-Inventar
│   │   │   └── index.ts       #     analyze(), phoneticFields(), initials()
│   │   ├── sound/             #   Klang-Engine (PRD 5.1)
│   │   │   ├── score.ts       #     Score, Ampel, Flags
│   │   │   ├── checks.ts      #     Initialen, Genitiv, Reim, Buchstabieren
│   │   │   └── flags.ts       #     Flag-Codes und -Typen
│   │   ├── style/             #   Stil-Engine (PRD 5.2)
│   │   │   ├── vector.ts      #     Distanzen, Mittelwerte, Streuung
│   │   │   ├── calibration.ts #     Profilformel, Confidence
│   │   │   └── profile.ts     #     Klartext-Zusammenfassung
│   │   ├── matching/          #   Matching-Engine (PRD 5.3)
│   │   │   ├── deck.ts        #     Deck-Zusammenstellung, Stilvarianz
│   │   │   ├── recommend.ts   #     Empfehlungsformel, novelty, penalty
│   │   │   ├── match.ts       #     Match-Logik, Sichtbarkeitsregel
│   │   │   ├── divergence.ts  #     Divergenz-Report
│   │   │   ├── elo.ts         #     Paarvergleich, Ranking, Zweitname-Ventil
│   │   │   └── random.ts      #     deterministischer Zufall (mulberry32)
│   │   └── client/            #   API-Hüllen und React-Hooks
│   ├── server/                # Alles, was Zustand anfasst
│   │   ├── db.ts              #   SQLite-Schema (PRD Kapitel 8)
│   │   ├── repo.ts            #   Datenzugriff, Match-Sync, Profile
│   │   ├── corpus.ts          #   Korpus laden und indizieren
│   │   ├── session.ts         #   Cookie-Sitzung
│   │   ├── events.ts          #   SSE-Bus pro Raum
│   │   └── api.ts             #   DTOs, Deck-Aufruf, Fehlerabbildung
│   ├── components/            # NameCard, NameSheet, SwipeDeck, ui
│   └── app/                   # Screens und API-Routen (App Router)
├── tests/                     # klang, raum, deck, pipeline
└── scripts/probe-divergence.ts
```

### Ablauf einer Anfrage

Beispiel: eine Bewertung, die ein Match erzeugt.

```
Swipe im Browser
  └→ POST /api/ratings  { ref, value, reasonTag?, sharedReason? }
       └→ requireParent()                        Cookie → Elternteil
       └→ rate(parent, ref, value)               src/server/repo.ts
            ├→ Veto-Budget prüfen und fortschreiben
            ├→ Rating speichern (UPSERT auf parent_id + name_ref)
            ├→ refreshProfile()                  Profil gleitend aktualisieren
            └→ syncMatch()
                 ├→ evaluateMatch(eigene, fremde Bewertung)
                 ├→ Match anlegen, ändern oder löschen
                 └→ publish(coupleId, { type: 'match', … })
                      └→ SSE an das Gerät des Partners
       └→ Antwort: { match | null, vetosRemaining }
```

Die Antwort enthält **nur** dann etwas über den Partner, wenn beide zugestimmt
haben. Bei `pass` oder `veto` erfährt der Client nichts — auch nicht implizit
über eine Zustandsänderung.

### Die drei Engines

**Klang-Engine** (`src/lib/sound/`, PRD 5.1)

Startet bei 100 Punkten, zieht ab und legt drauf:

| Regel | Bedingung | Delta |
|---|---|---|
| `vowel_clash` | Vorname endet auf Vokal, Nachname beginnt mit Vokal | −25 |
| `consonant_clash` | letzter Laut = erster Laut des Nachnamens | −20 |
| `rhyme` | letzte Silben reimen sich | −20 |
| `sibilant_overload` | drei oder mehr Zischlaute zusammen | −15 |
| `rhythm_flat` | gleiche Silbenzahl **und** gleiche Betonung | −15 |
| `too_long` | sechs Silben oder mehr | −15 |
| `alliteration` | gleicher Anlaut | −10 |
| `rhythm_good` | Silbendifferenz ≥ 2 | +10 |
| `balance_good` | ein Teil einsilbig, der andere mehrsilbig | +10 |

Dazu Flags ohne Score-Einfluss: Initialen-Check, Genitiv-Probe, Reim-/Hänsel-
Check, Buchstabier-Score, Geschwister-Check. Ampel bei 75 und 50.

**Rot ist nie ein Ausschluss.** Die Engine filtert nichts, sie erklärt nur.

Die Phonetik dahinter ist eine eigene deutsche Regeltabelle
(`src/lib/phonetics/g2p.ts`) mit rund 60 Regeln: Mehrgraphen zuerst
(`tsch`, `sch`, `chs`), Vokallänge aus dem Folgekontext, Auslautverhärtung,
vokalisiertes r, Schwa in unbetonten Endsilben. Silbenkerne sind die
Vokalphoneme, mit einer Sonderregel für [ɐ] — „Lars" ist einsilbig, „Sommer"
zweisilbig.

Dieselbe Tabelle läuft in der Pipeline **und** zur Laufzeit. Zwei
Implementierungen (etwa espeak im Build, Regeln im Client) würden Korpus und
Eingabemaske auseinanderlaufen lassen; Pipeline-Schritt 8 prüft die
Übereinstimmung für jeden Namen nach.

**Stil-Engine** (`src/lib/style/`, PRD 5.2)

Fünf Achsen in `[0,1]`: `era`, `softness`, `reach`, `frequency`, `ambiguity`.
Das Profil entsteht aus den Bewertungen:

```
profil[achse] = mean(ja_namen[achse]) − 0.5 × (mean(nein_namen[achse]) − 0.5)
```

Pro Achse wird zusätzlich eine `confidence` invers zur Streuung der Ja-Namen
gespeichert. Achsen mit niedriger Confidence werden im Matching schwächer
gewichtet und im Profil-Screen gar nicht erst behauptet — wer sich dort nicht
festgelegt hat, bekommt das gesagt statt einer erfundenen Aussage.

**Matching-Engine** (`src/lib/matching/`, PRD 5.3)

```
zielvektor = (profil_a + profil_b) / 2

score(name) = w1 × (1 − distanz(name, zielvektor))
            + w2 × (klang_score / 100)
            + w3 × novelty
            − w4 × penalty
```

Das Deck mischt daraus drei Quellen: 60 % Grundkorpus nach eigenem Profil,
25 % Brückenvorschläge (nah am Zielvektor, von keinem gesehen), 15 %
Divergenz-Injektion (Distanz > 0.4, zufällig gezogen). Die drei Töpfe werden
verschränkt, damit Ausreißer nicht am Stück kommen.

Der Zufall ist deterministisch (`mulberry32`, Seed aus Raum + Person +
Bewertungszahl): derselbe Zustand liefert dieselbe Kartenfolge. Ohne das ließe
sich der Regressionstest aus PRD 13 nicht schreiben.

### Datenbankschema

SQLite, WAL-Modus, Fremdschlüssel aktiv. Erzeugt in `src/server/db.ts`.

```
couple                          Der gemeinsame Raum
├── id (TEXT, PK)
├── invite_code (TEXT, UNIQUE)  sechs Zeichen, ohne I/O/0/1
├── surname (TEXT, NOT NULL)    Pflichtfeld
├── surname_phonetics (TEXT)    JSON, bei Änderung neu berechnet
├── due_date, gender_preference, sibling_names, secondary_language
└── divergence_report_shown     sorgt dafür, dass er genau einmal erscheint

parent                          Genau zwei pro couple
├── id (TEXT, PK) · couple_id (FK, ON DELETE CASCADE)
├── display_name · device_token
├── style_profile (TEXT)        JSON, fünf Achsen
├── style_confidence (TEXT)     JSON, gleiche Schlüssel
├── calibration_complete (INT)
├── vetos_remaining (INT)       Default 5
└── slot (INT)                  0 oder 1, UNIQUE je couple

custom_name                     Selbst hinzugefügte Namen (PRD F4)
├── id · couple_id · added_by_parent_id
├── name · gender
├── phonetics (TEXT)            JSON, aus der Regeltabelle
└── style_vector (TEXT)         JSON, über phonetische Nachbarschaft geschätzt

rating                          UNIQUE (parent_id, name_ref)
├── parent_id · name_ref        "corpus:n00042" oder "custom:cst_…"
├── value                       CHECK IN (love, like, pass, veto)
├── reason_tag                  privat
└── shared_reason (INT)         nur für „erinnert mich an jemanden"

name_match                      UNIQUE (couple_id, name_ref)
├── couple_id · name_ref
└── is_super (INT)              zwei love

elo_score                       PK (parent_id, name_ref)
├── rating (REAL)               Start 1500
└── comparisons (INT)

comparison                      Verlauf der Paarvergleiche
trial_week                      Probewohnen, verdict_a / verdict_b
nickname_vote                   PK (parent_id, name_ref, nickname)
```

**Berechnete Werte werden nicht gespeichert** (PRD Kapitel 8): Klang-Score,
Flags und Empfehlungsranking entstehen zur Laufzeit. Deshalb muss beim Ändern
des Nachnamens nichts migriert werden — der Testfall aus PRD 13 ist strukturell
erfüllt statt durch eine Migrationsroutine.

Die Tabelle heißt `name_match`, weil `MATCH` in SQLite ein Operator ist.

### API-Routen

| Route | Methoden | Zweck |
|---|---|---|
| `/api/session` | GET, POST, PUT, DELETE | Zustand abfragen, Raum anlegen, beitreten, abmelden |
| `/api/couple` | PATCH, DELETE | Nachname und Rahmendaten ändern, Raum löschen |
| `/api/calibration` | GET, POST | Kalibrierungskarten holen, Kalibrierung abschließen |
| `/api/deck` | GET | nächster Kartenstapel |
| `/api/ratings` | GET, POST, DELETE | eigene Vetos, bewerten, Veto zurücknehmen |
| `/api/profile` | GET | eigenes Stilprofil |
| `/api/matches` | GET | gemeinsame Ergebnisse |
| `/api/custom-names` | GET, POST | eigene Liste |
| `/api/sound` | POST | Klangbewertung einer freien Eingabe |
| `/api/compare` | GET, POST | nächstes Vergleichspaar, Ergebnis |
| `/api/shortlist` | GET | kombiniertes Ranking, Zweitname-Ventil |
| `/api/trial` | GET, PUT, POST | Probewohnen: Stand, Name setzen, Urteil |
| `/api/divergence` | GET, POST | Divergenz-Report, als gesehen markieren |
| `/api/nicknames` | POST | Spitznamen-Abstimmung |
| `/api/events` | GET | SSE-Stream |

Es gibt **keine** Route, über die sich das Profil, die Ablehnungen oder die
eigene Liste des Partners abrufen ließen. Das ist keine Berechtigungsfrage,
sondern eine Frage dessen, was die Routen überhaupt können.

### Echtzeit-Sync

`src/server/events.ts` hält einen In-Memory-Bus pro Raum. Der Stream überträgt:

| Ereignis | Inhalt |
|---|---|
| `match` | `{ ref, isSuper }` |
| `partner_joined` | Anzeigename |
| `partner_calibrated` | — |
| `veto_count` | `{ parentId, remaining }` — nur die Zahl, nie der Name |
| `custom_name_added` | — (ohne zu verraten, welcher) |
| `surname_changed`, `trial_updated`, `room_deleted` | — |

Ein Heartbeat alle 25 Sekunden hält Proxys davon ab, die Verbindung zu kappen.

**Grenze:** Der Bus lebt im Prozess. Bei mehreren Instanzen bräuchte es Redis
Pub/Sub oder Postgres `LISTEN`/`NOTIFY`.

---

## Der Namenskorpus

Der Korpus wird **nicht zur Laufzeit abgefragt**, sondern einmalig gebaut. Das
Ergebnis ist eine statische Tabelle; zur Laufzeit finden nur noch lokale Vektor-
und Score-Berechnungen statt.

### Die neun Schritte

| # | Skript | Was passiert | Ausgabe |
|---|---|---|---|
| 1 | `01-fetch.ts` | 156 CSV-Dateien laden, mit `source_id` + Lizenz taggen | `data/raw/` (2,1 MB) |
| 2 | `02-clean.ts` | Nicht-Namen filtern, Groß-/Kleinschreibung vereinheitlichen | 154.700 Zeilen |
| 3 | `03-normalize.ts` | Erstnamen isolieren, Schreibvarianten mappen | 45,9 MB |
| 4 | `04-merge.ts` | Bezirke zusammenführen, Häufigkeit je Jahr | 9.365 Namen |
| 5 | `05-phonemize.ts` | Lautschrift, Silben, Betonung | 6,5 MB |
| 6 | `06-enrich.ts` | Wikidata, Spitznamen, Reime, Bedeutung | 13,4 MB |
| 7 | `07-vectorize.ts` | Stilvektoren, kuratierte Overrides | 15,8 MB |
| 8 | `08-validate.ts` | Testfälle aus PRD 13, Vollständigkeit | Prüfbericht |
| 9 | `09-export.ts` | statische Tabelle + `ATTRIBUTIONS.md` | 3.001 Namen |

Jeder Schritt schreibt sein Zwischenergebnis nach `data/interim/` (zusammen
~119 MB, gitignored). Wer an Schritt 3 etwas korrigiert, startet ab Schritt 3
neu und muss nicht wieder durch die Wikidata-Abfrage:

```bash
npm run corpus:build                        # alles
npx tsx pipeline/run-all.ts --from=05       # ab Schritt 5
npx tsx pipeline/07-vectorize.ts            # nur ein Schritt
npx tsx pipeline/01-fetch.ts --force        # Cache umgehen
npx tsx pipeline/06-enrich.ts --no-wikidata # ohne Netz
DISTRIBUTION_SAFE=true npm run corpus:build # Modus B
```

### Quellen und Lizenzen

| Quelle | Umfang | Lizenz | Rolle |
|---|---|---|---|
| Berliner Standesämter | 2012–2023, 12 Bezirke | CC BY 3.0 DE | Namen und Häufigkeiten |
| Wikidata | Sprachversionen je Vorname | CC0 1.0 | Achse `reach` |
| Selbst formuliert | 72 Namen | eigen | Bedeutung und Herkunft |
| Handkuratiert | 8 Tabellen | eigen | Kalibrierung, Spitznamen, Reime, Overrides |

Jedes Feld trägt `source_id` und `license` bis in den fertigen Korpus.
`data/corpus/ATTRIBUTIONS.md` wird beim Export daraus **generiert** — nicht von
Hand gepflegt.

Der Wechsel von Modus A (Eigengebrauch) nach Modus B (Auslieferung an Dritte)
ist ein Umgebungsschalter, keine Datenmigration. `DISTRIBUTION_SAFE=true`
entfernt jedes Feld, dessen Lizenz eine Weitergabe nicht deckt. Derzeit
entfernt er nichts, weil alle benutzten Quellen verbreitungsfähig sind —
geprüft in `tests/pipeline.test.ts` mit einem eingeschleusten Feld unter
restriktiver Lizenz.

### Das Positionsproblem

Berlin liefert die Spalte `position` erst ab 2017. Davor zählt jede Zeile alle
Vornamen einschließlich Zweit- und Drittnamen.

Ein globaler Korrekturfaktor würde genau die Namen verzerren, um die es geht:
„Marie" und „Sophie" stehen weit überwiegend an zweiter Stelle, „Noah" fast
immer an erster. Der Faktor wird deshalb **pro Name** aus den Jahren mit
Positionsangabe geschätzt, mit globalem Rückfall (66,8 %) bei dünner Datenlage.

Ohne die Korrektur wäre Marie mit Abstand der häufigste Name im Korpus. Der
Test in `tests/pipeline.test.ts` prüft, dass sie es nicht ist.

---

## Umgebungsvariablen

Es gibt keine `.env`-Datei und keine Pflichtvariable. Die App läuft ohne jede
Konfiguration.

| Variable | Gilt für | Default | Zweck |
|---|---|---|---|
| `ZWEI_LISTEN_DB` | Laufzeit | `data/app.sqlite` | Pfad zur SQLite-Datei. Die Tests setzen sie auf ein temporäres Verzeichnis. |
| `DISTRIBUTION_SAFE` | Build | `false` | `true` = Modus B: Felder ohne verbreitungsfähige Lizenz werden aus dem Export entfernt. |
| `PORT` | Laufzeit | `3000` | Port des Next-Servers. |
| `NODE_ENV` | Laufzeit | von Next gesetzt | Steuert unter anderem das `secure`-Flag des Sitzungs-Cookies. |

Alles, was fachlich einstellbar ist, steht stattdessen in **`config/tuning.json`**
— absichtlich als Datei statt als Umgebungsvariable, weil PRD 14.2 verlangt,
dass die Gewichte der Empfehlungsformel ohne Code-Änderung testbar sind:

| Schlüssel | Wert | PRD |
|---|---|---|
| `vetos.perParent` | 5 | 5.3.2 |
| `recommendation.w1_styleDistance` … `w4_penalty` | 0.45 / 0.30 / 0.15 / 0.10 | 5.3.5 |
| `deck.shareBaseCorpus` / `shareBridge` / `shareDivergence` | 0.6 / 0.25 / 0.15 | F3 |
| `deck.divergenceMinDistance` | 0.4 | 5.3.5 |
| `deck.preloadCards` | 50 | 10 |
| `calibration.setSize` | 20 | 5.2.2 |
| `sound.greenFrom` / `yellowFrom` | 75 / 50 | 5.1.2 |
| `divergence.reportProfileDistance` | 0.224 | 5.3.5 (siehe [Abweichungen](#abweichungen-vom-prd)) |
| `shortlist.unlockAtMatches` / `eloK` / `eloStart` | 4 / 32 / 1500 | F7 |
| `corpus.targetSize` | 3000 | 9.8 |

Jeder Eintrag trägt im JSON ein `_prd`-Feld mit der Fundstelle.

## Verfügbare Befehle

| Befehl | Beschreibung |
|---|---|
| `npm run dev` | Entwicklungsserver auf Port 3000 (Turbopack) |
| `npm run build` | Produktionsbuild nach `.next/` |
| `npm start` | Produktionsserver (setzt `npm run build` voraus) |
| `npm run typecheck` | `tsc --noEmit` über das gesamte Projekt |
| `npm test` | 52 Tests via `node:test` |
| `npm run corpus:build` | Vollständiger Korpus-Build, Schritte 1–9 |
| `npm run corpus:fetch` | Nur Schritt 1: Rohdaten laden |
| `npm run corpus:clean` | Nur Schritt 2: Müll filtern |
| `npm run corpus:normalize` | Nur Schritt 3: Erstnamen, Varianten |
| `npm run corpus:merge` | Nur Schritt 4: Bezirke zusammenführen |
| `npm run corpus:phonemize` | Nur Schritt 5: Lautschrift |
| `npm run corpus:enrich` | Nur Schritt 6: Wikidata, Spitznamen |
| `npm run corpus:vectorize` | Nur Schritt 7: Stilvektoren |
| `npm run corpus:validate` | Nur Schritt 8: Prüfungen |
| `npm run corpus:export` | Nur Schritt 9: Export + Attributions |

Zusätzlich, ohne npm-Skript:

```bash
npx next dev -H 0.0.0.0            # im Netz erreichbar
npx tsx pipeline/run-all.ts --from=05
npx tsx scripts/probe-divergence.ts # misst erreichbare Profil-Distanzen
node --import tsx --test tests/klang.test.ts  # eine einzelne Testdatei
```

## Tests

```bash
npm test                                          # alle
node --import tsx --test tests/raum.test.ts       # eine Datei
node --import tsx --test --test-name-pattern="Veto" tests/*.test.ts
```

Erwartete Ausgabe:

```
ℹ tests 52
ℹ pass 52
ℹ fail 0
```

### Aufbau

| Datei | Umfang | Inhalt |
|---|---|---|
| `tests/klang.test.ts` | 14 | Alle Klang-Testfälle aus PRD 13, Genitiv, Reim-Sparsamkeit, Silben, Betonung, Hiat-Regel |
| `tests/raum.test.ts` | 16 | Raum, Beitrittsgrenze, Vetos, Match und Super-Match, Nachnamenwechsel, Divergenz, geteilte Gründe, eigene Namen |
| `tests/deck.test.ts` | 8 | Divergenz-Regressionstest, Quellenmischung, Brücken-Novelty, penalty, Profilformel, Confidence |
| `tests/pipeline.test.ts` | 14 | `DISTRIBUTION_SAFE`, Attributions-Vollständigkeit, Nicht-Namen-Filter, Positionskorrektur, Phonetik-Konsistenz |

`tests/raum.test.ts` setzt `ZWEI_LISTEN_DB` **vor** dem ersten Import auf ein
temporäres Verzeichnis und räumt danach auf — jeder Lauf bekommt eine eigene
Datenbank:

```typescript
const tempDir = mkdtempSync(join(tmpdir(), 'zwei-listen-test-'))
process.env.ZWEI_LISTEN_DB = join(tempDir, 'test.sqlite')
const repo = await import('../src/server/repo.ts')   // dynamisch, nach dem setzen
```

`tests/deck.test.ts` und `tests/pipeline.test.ts` lesen `data/corpus/names.json`
direkt. Fehlt der Korpus, schlagen sie fehl — dann erst `npm run corpus:build`.

### Der Regressionstest aus PRD 13

Der interessanteste Test simuliert 100 Swipes und misst die mittlere paarweise
Stildistanz der letzten 20 Karten. Er prüft zweierlei: dass die Varianz mit
Divergenz-Injektion über dem Schwellwert bleibt, **und** dass sie ohne sie
messbar abfällt. Der zweite Teil ist der eigentliche Nachweis, dass der
Parameter überhaupt etwas bewirkt.

## Deployment

Es liegt **keine** Deployment-Konfiguration im Repo — kein Dockerfile, kein
`fly.toml`, kein `vercel.json`. Das Projekt läuft laut PRD 14.6 in Modus A
(Eigengebrauch).

### Zwei Randbedingungen vor jeder Plattformwahl

1. **SQLite braucht ein persistentes Dateisystem.** Plattformen mit flüchtigem
   Dateisystem (Vercel, Netlify, Cloud Run ohne Volume) verlieren bei jedem
   Deploy alle Räume. Entweder ein Volume einbinden oder auf Postgres wechseln
   — dafür wäre `src/server/db.ts` und `src/server/repo.ts` anzupassen, sonst
   nichts.
2. **Der SSE-Bus lebt im Prozess.** Bei mehr als einer Instanz landen die zwei
   Elternteile womöglich auf verschiedenen Prozessen und sehen die Matches des
   anderen nicht in Echtzeit. Entweder auf einer Instanz bleiben (für ein
   Produkt mit zwei Nutzern pro Raum völlig ausreichend) oder Redis Pub/Sub in
   `src/server/events.ts` einziehen.

### Docker (empfohlen)

Es gibt noch kein Dockerfile. Dieses hier funktioniert:

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
# Der Korpus muss mit — die App startet ohne ihn nicht.
COPY --from=build /app/data/corpus ./data/corpus
COPY --from=build /app/data/curated ./data/curated
COPY --from=build /app/config ./config
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t zwei-listen .
docker run -p 3000:3000 \
  -v zwei-listen-data:/app/data \
  -e ZWEI_LISTEN_DB=/app/data/app.sqlite \
  zwei-listen
```

Das Volume ist nicht optional: ohne es ist der Raum nach dem nächsten Neustart
weg.

### Eigener Server (systemd)

```bash
git pull && npm ci && npm run build
sudo systemctl restart zwei-listen
```

```ini
# /etc/systemd/system/zwei-listen.service
[Unit]
Description=Zwei Listen
After=network.target

[Service]
Type=simple
User=zweilisten
WorkingDirectory=/srv/zwei-listen
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=ZWEI_LISTEN_DB=/var/lib/zwei-listen/app.sqlite
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Davor gehört ein Reverse Proxy mit TLS. Für nginx wichtig: SSE braucht
ausgeschaltetes Buffering, sonst kommen Matches erst mit Verzögerung an.

```nginx
location /api/events {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 24h;
}
```

Der Sitzungs-Cookie setzt `secure` sobald `NODE_ENV=production` — ohne TLS
funktioniert die Anmeldung in Produktion also nicht.

### Vor einer Auslieferung an Dritte

PRD 9.1 unterscheidet privates Repository und Auslieferung. Sobald andere Paare
das Werkzeug nutzen, gelten die Lizenzen der Quelldaten in vollem Umfang:

```bash
DISTRIBUTION_SAFE=true npm run corpus:build
```

Dann `data/corpus/ATTRIBUTIONS.md` prüfen — die CC-BY-Pflichtangabe für die
Berliner Daten muss im ausgelieferten Produkt sichtbar sein.

---

## Entscheidungen zu den offenen Fragen (PRD Kapitel 14)

Alle Werte stehen in `config/tuning.json` und sind dort einzeln begründet.

| # | Frage | Entscheidung | Warum |
|---|---|---|---|
| 1 | Anzahl Vetos | **5** | Die Hypothese aus dem PRD unverändert übernommen. Es gibt keine Datenlage, die einen anderen Wert stützt, und der Parameter ist ohne Deploy änderbar. |
| 2 | Gewichte w1–w4 | **0.45 / 0.30 / 0.15 / 0.10** | Startwerte aus dem PRD, in der Konfigurationsdatei statt im Code. |
| 3 | Divergenz-Anteil | **15 %** | Unverändert. Der Regressionstest misst, was der Parameter tatsächlich bewirkt: ohne Injektion fällt die Stilvarianz der letzten 20 Karten messbar ab. |
| 4 | Sehr seltene Nachnamen | **Regeltabelle im Client, kein serverseitiger Fallback** | Die Regeln decken auch unbekannte Nachnamen ab — sie brauchen kein Wörterbuch, nur Buchstaben. Ein espeak-Endpunkt wäre eine Netzabhängigkeit für einen Gewinn, den wir nicht messen konnten. Die Grenze ist die Betonung, nicht die Lautschrift, und die fließt nur in eine einzige weiche Regel ein. |
| 5 | Match-Benachrichtigung | **gebündelt am Abend, maximal eine pro Tag und Person** | Das PRD nennt beides als vertretbar. Gebündelt gewinnt, weil sofortige Benachrichtigungen den anderen beim Swipen unterbrechen — und wer unterbrochen wird, bewertet die nächste Karte nicht mehr blind. Kernprinzip 2 schlägt Befriedigung. |
| 6 | Modus A oder B | **Modus A, `DISTRIBUTION_SAFE=false`** | Der Wechsel ist ein Umgebungsschalter. Alle benutzten Quellen sind bereits verbreitungsfähig. |
| 7 | Gleichzeitiges Swipen erkennen | **nein** | Es gäbe nur zwei Reaktionen darauf: eine Anzeige („ihr swipet gerade beide") oder eine Synchronisierung der Decks. Die erste erzeugt Beobachtungsdruck, die zweite bricht die Blindheit. Beides widerspricht Kernprinzip 2. |

## Abweichungen vom PRD

Vier Stellen, an denen die Umsetzung nicht dem Buchstaben des PRD folgt. Jede
ist im Code an der Fundstelle kommentiert.

### 1. Divergenz-Schwelle: 0.5 ist unerreichbar

PRD 5.3.5 nennt zwei Verwendungen derselben `euklid_distanz`:

- in der Empfehlungsformel als `1 − distanz` — das verlangt einen Wert in
  `[0,1]`, also die durch √5 geteilte Distanz;
- als Schwelle für den Divergenz-Report: „Distanz > 0.5".

Beides zusammen geht nicht auf. In der normierten Skala erreichen selbst
maximal gegensätzliche Profile nur **0.492** — gemessen mit
`scripts/probe-divergence.ts`, weil Profile Mittelwerte sind und nie in den
Ecken des Würfels liegen. Mit 0.5 wäre der Report tot; über 3.000 simulierte
Paare hinweg löst er kein einziges Mal aus.

Gesetzt ist `0.5 / √5 ≈ 0.224`: dieselbe Zahl aus dem PRD, gelesen als **rohe**
Distanz. Sie löst bei etwa fünf Prozent der Paare aus.

### 2. Kurz-lang-Balance greift über „2–3 Silben" hinaus

Die Regel in PRD 5.1.2 lautet „Nachname 1 Silbe **und** Vorname 2–3 Silben
(oder umgekehrt)". Testfall 3 aus PRD 13 erwartet `balance_good` für
„Maximilian Kim" — fünf Silben. Die Obergrenze 3 ist dort also nicht gemeint.
Umgesetzt als: ein Teil einsilbig, der andere mehrsilbig.

### 3. `softness` ist regelbasiert, nicht LLM-annotiert

PRD 9.6 nennt die LLM-Einschätzung als die bessere Variante und die
regelbasierte als möglich. Dieser Build hat keinen Modellzugriff, deshalb greift
die regelbasierte über Vokalanteil, Plosiv- und Sonorantenanteil. Die
Schnittstelle für eine spätere Annotation ist
`data/curated/style-overrides.json` — dort eingespielte Werte überschreiben die
Regel, ohne dass sich sonst etwas ändert.

### 4. `era` misst den Trend, nicht die Epoche

PRD 9.6 will `era` aus dem Häufigkeitsverlauf über Jahrzehnte („Peak vor 1970 →
klassisch"). Die verfügbaren Daten reichen von 2012 bis 2023. In diesem Fenster
ist ein Peak vor 1970 unsichtbar; die Regel misst, ob ein Name gerade steigt
oder fällt.

An der Retro-Welle scheitert das sichtbar: Frieda, Ida, Fritz und Theodor
steigen stark, die Regel hält sie deshalb für modern. Sie sind das Gegenteil.
Behandelt mit dem Mittel, das PRD 9.6 selbst vorsieht — der manuellen Prüfung
der Top 200. `data/curated/style-overrides.json` enthält 116 Einträge, ganz
überwiegend `era`.

Zusätzlich schrumpft der Rohwert zur Mitte, je dünner die Datenlage: ein Name
mit fünf Nennungen in einem einzigen Jahr ist kein Epochensignal, sondern
Rauschen.

## Was während der Umsetzung auffiel

Drei Dinge, die sich erst im laufenden Betrieb zeigten und behoben wurden:

- **Achsen mit niedriger Confidence wogen im Matching voll mit.** PRD 5.2.2
  verlangt das Gegenteil. Besonders `ambiguity` schlug durch: über neunzig
  Prozent des Korpus liegen dort bei 0, ein Profil bei 0.5 macht damit den
  halben Korpus künstlich „weit weg". Jetzt gewichtet `combinedAxisWeights` die
  Distanz mit der geringeren Confidence beider Profile.
- **Selbst hinzugefügte Namen erschienen faktisch nie beim Partner.** PRD F4
  sagt „automatisch"; über den Empfehlungsscore konkurriert ein einzelner Name
  aber gegen dreitausend Korpusnamen. Sie bekommen jetzt Vorrang im nächsten
  Stapel — unmarkiert, wie jede andere Karte. Und sie landen auch im *eigenen*
  Deck, sonst könnten sie nie ein Match werden.
- **Die Initialen-Warnung feuerte bei jedem „S… A…".** Zweibuchstaben-Einträge
  werden jetzt nur bei exakter Übereinstimmung der ganzen Kette geprüft. Eine
  Warnung, die bei jedem zweiten Namen erscheint, wird ignoriert.

## Bekannte Lücken

- **Nur Berlin.** Köln, Dortmund und Düsseldorf sind in `pipeline/sources.ts`
  mit Lizenz und Portal registriert, aber nicht angebunden — die Portale waren
  beim Bau nicht über eine stabile CKAN-API erreichbar. Das Hinzufügen ist ein
  Adapter, keine Architekturänderung. Damit gilt der Großstadt-Bias aus PRD
  9.3.3 in verschärfter Form: „selten" heißt hier **selten in Berlin**. Die
  Texte im UI formulieren das entsprechend.
- **`reach` ist die schwächste Achse.** Das Wikidata-Signal ist verrauscht
  („Noah" hat als Vorname-Item nur eine Sprachversion), das orthografische
  Ersatzsignal erkennt deutsche Verankerung besser als internationale
  Verbreitung.
- **Bedeutungstexte für 72 Namen.** Bewusst: PRD 9.4 stuft Bedeutung als
  Nebenfeld ein und rät ausdrücklich davon ab, dort Zeit zu investieren, bevor
  die Klang-Engine steht.
- **Push-Benachrichtigungen sind spezifiziert, aber nicht gebaut.** Die
  Bündelungslogik steht in der Konfiguration; es fehlt die Anbindung an einen
  Push-Dienst. In der App erscheinen Matches über den SSE-Stream.
- **Kein Service Worker.** Das Deck lädt 50 Karten vor und überbrückt damit
  Verbindungsabbrüche innerhalb einer Session, aber ein Neustart ohne Netz
  zeigt nichts.
- **Der zweite Sprachraum wird erfasst, aber nicht ausgewertet.** PRD 9.5 sieht
  vor, für binationale Paare beide Aussprachevarianten zu berechnen; im Moment
  wird das Feld nur gespeichert (PRD 12, Phase 5).

## Fehlersuche

### Die Seite bleibt bei „Einen Moment…" stehen

**Bei Zugriff über die LAN-IP.** Next.js blockiert Entwicklungs-Ressourcen für
fremde Origins; das Client-JavaScript lädt nicht und die Seite bleibt beim
server-gerenderten Ladezustand. Im Terminal steht dann:

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/... from "192.168.x.x"
```

**Lösung:** Die Adresse gehört in `allowedDevOrigins` in `next.config.ts`. Die
üblichen privaten Netzbereiche sind bereits eingetragen; nach einer Änderung
den Server neu starten und im Browser hart neu laden (Cmd/Ctrl + Shift + R),
damit das fehlgeschlagene JavaScript nicht aus dem Cache kommt.

### `Korpus fehlt. Erst npm run corpus:build ausführen`

`data/corpus/names.json` ist nicht da. Entweder aus dem Repository holen oder
neu bauen:

```bash
npm run corpus:build
```

### `npm install` scheitert an `better-sqlite3`

Für die Plattform gibt es kein vorkompiliertes Binary, der Bau aus dem
Quelltext braucht eine C++-Toolchain:

```bash
xcode-select --install                     # macOS
sudo apt-get install -y build-essential python3  # Debian/Ubuntu
npm rebuild better-sqlite3
```

### Wikidata-Batch schlägt mit HTTP 502 fehl

Der öffentliche Endpunkt antwortet unter Last mit 502 oder 429. Der Schritt
versucht es dreimal mit wachsender Pause und bricht dann ab — der bereits
geholte Teil bleibt in `data/interim/wikidata-sitelinks.json` erhalten. Einfach
noch einmal starten, es werden nur die fehlenden Namen nachgeholt:

```bash
npx tsx pipeline/06-enrich.ts
```

Wer keine Zeit hat, baut ohne: `npx tsx pipeline/06-enrich.ts --no-wikidata`.
Dann greift für `reach` der regelbasierte Ersatz.

### Schritt bricht mit „Zwischenergebnis fehlt" ab

Ein Pipeline-Schritt wurde ohne seinen Vorgänger gestartet. Die Kette ab dem
letzten vorhandenen Zwischenergebnis neu starten:

```bash
ls data/interim/
npx tsx pipeline/run-all.ts --from=04
```

### Matches erscheinen nicht ohne Neuladen

Der SSE-Stream ist unterbrochen. In den Entwicklerwerkzeugen prüfen, ob
`/api/events` offen ist. Hinter einem Reverse Proxy fast immer Buffering —
siehe die nginx-Konfiguration unter [Deployment](#deployment).

### Port 3000 ist belegt

```bash
lsof -i :3000            # wer hält ihn
PORT=3001 npm run dev    # oder ausweichen
```

### Ein dritter Beitritt wird abgelehnt

Kein Fehler, sondern PRD F1: genau zwei Personen pro Raum. Für einen frischen
Raum:

```bash
rm -f data/app.sqlite data/app.sqlite-wal data/app.sqlite-shm
```

### Tests schlagen nach einem Korpus-Neubau fehl

`tests/pipeline.test.ts` prüft den gebauten Korpus. Wenn Filterregeln oder
Stilvektoren geändert wurden, wollen die Erwartungen mitgezogen werden. Erst
den Prüfbericht der Pipeline ansehen:

```bash
npx tsx pipeline/08-validate.ts
```

---

## Datenschutz

Hier entsteht ein Datensatz über eine ungeborene Person und über
Meinungsverschiedenheiten zwischen zwei Partnern. Entsprechend gebaut:

- Ablehnungen (`pass`, `veto`) verlassen **niemals** das eigene Konto in
  identifizierbarer Form. Die einzigen Wege, auf denen etwas nach außen dringt,
  sind der Veto-Zähler und der freiwillig geteilte Hinweis „bei einem Namen gab
  es eine persönliche Assoziation" — beide ohne Namen.
- Vollständige Löschung des Raums durch **jeden** Elternteil, sofort, ohne
  Rückfrage und ohne Wartefrist (`DELETE /api/couple`, `ON DELETE CASCADE`).
- Keine Analytics, keine Werbe-IDs, kein Tracking von Namenspräferenzen.
- `robots: noindex, nofollow`, kein Vorschaubild, kein öffentlicher Link.

### Was bewusst nicht gebaut wurde

Kein Teilen der Shortlist, keine Umfrage, kein Voting-Link, keine
Kompatibilitäts-Prozentzahl, kein Konfetti, kein rotes X bei Ablehnung, kein
Mehrpersonen-Modus. Alles davon steht so im PRD, und alles davon hätte man
versehentlich mitbauen können.

Die Freigabe an Dritte ist ausdrücklich eine Produktentscheidung, keine
Priorisierung: externe Meinungen zerstören mehr Namen, als sie retten. Diese
Funktion wird auch auf Nutzerwunsch nicht gebaut.
