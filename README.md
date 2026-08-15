# Zwei Listen

Namensfinder für werdende Eltern. Umsetzung von `PRD-Namensfinder.md`.

> Dieses Produkt sucht keine Namen. Es moderiert eine Verhandlung zwischen zwei
> Menschen, die sich nicht wehtun wollen.

Zwei Personen, ein Raum, zwei Geräte. Jeder bewertet für sich, sichtbar wird
ausschließlich die Übereinstimmung. Der Nachname ist von der ersten Karte an
dabei.

---

## Schnellstart

```bash
npm install
npm run corpus:build     # einmalig, ~5 Minuten (lädt Berliner Standesamtsdaten)
npm run dev              # http://localhost:3000
```

Der gebaute Korpus liegt in `data/corpus/names.json` und ist eingecheckt — für
einen reinen App-Lauf ist `corpus:build` also nicht nötig.

```bash
npm test                 # 52 Tests, darunter alle Fälle aus PRD Kapitel 13
npm run typecheck
npm run build && npm start
```

## Aufbau

| Verzeichnis | Inhalt |
|---|---|
| `src/lib/phonetics/` | Deutsche Graphem-zu-Phonem-Regeln, Silben, Betonung |
| `src/lib/sound/` | Klang-Engine (PRD 5.1): Score, Flags, Klartext-Erklärungen |
| `src/lib/style/` | Stil-Engine (PRD 5.2): fünf Achsen, Kalibrierung, Profil |
| `src/lib/matching/` | Deck, Brückennamen, Divergenz, Match-Logik, Elo |
| `src/server/` | SQLite-Datenmodell (PRD 8), Repository, SSE-Bus |
| `src/app/` | Screens S1–S13 und API-Routen |
| `pipeline/` | Build-Pipeline, neun Schritte (PRD 9.8) |
| `data/curated/` | Handkuratierte Tabellen — Kalibrierungsset, Spitznamen, Reime |
| `config/tuning.json` | Alle Parameter, die im PRD als Hypothese markiert sind |

Die Phonetik-Regeln laufen in der Pipeline **und** zur Laufzeit. Zwei
Implementierungen würden Korpus und Eingabemaske auseinanderlaufen lassen;
Pipeline-Schritt 8 prüft die Übereinstimmung für jeden Namen nach.

## Der Korpus

Neun Schritte, jeder ein eigenes Skript mit Zwischenergebnis auf der Platte
(PRD 9.8). Wer an Schritt 3 etwas korrigiert, startet ab Schritt 3 neu:

```bash
npm run corpus:build                  # alles
npx tsx pipeline/run-all.ts --from=05 # ab Schritt 5
npx tsx pipeline/06-enrich.ts --no-wikidata
DISTRIBUTION_SAFE=true npm run corpus:build
```

**Quelle:** die Vornamenslisten der Berliner Standesämter 2012–2023
(CC BY 3.0 DE, bereits bereinigt und anonymisiert), ergänzt um Wikidata (CC0)
für die Achse `reach` und um selbst formulierte Bedeutungstexte.
`data/corpus/ATTRIBUTIONS.md` wird beim Export erzeugt, nicht von Hand
gepflegt.

**Ergebnis:** 3.001 Namen mit vollständigen Attributen.

### Das Positionsproblem

Berlin liefert die Spalte `position` erst ab 2017. Davor zählt jede Zeile alle
Vornamen einschließlich Zweit- und Drittnamen. Ein globaler Korrekturfaktor
würde genau die Namen verzerren, um die es geht: „Marie" und „Sophie" stehen
weit überwiegend an zweiter Stelle, „Noah" fast immer an erster. Der Faktor
wird deshalb **pro Name** aus den Jahren mit Positionsangabe geschätzt, mit
globalem Rückfall bei dünner Datenlage (`pipeline/04-merge.ts`).

Ohne die Korrektur wäre Marie mit Abstand der häufigste Name im Korpus. Der
Test in `tests/pipeline.test.ts` prüft, dass sie es nicht ist.

---

## Entscheidungen zu den offenen Fragen (PRD Kapitel 14)

Alle Werte stehen in `config/tuning.json` und sind dort einzeln begründet.

| # | Frage | Entscheidung | Warum |
|---|---|---|---|
| 1 | Anzahl Vetos | **5** | Die Hypothese aus dem PRD unverändert übernommen. Es gibt keine Datenlage, die einen anderen Wert stützt, und der Parameter ist ohne Deploy änderbar. |
| 2 | Gewichte w1–w4 | **0.45 / 0.30 / 0.15 / 0.10** | Startwerte aus dem PRD, in der Konfigurationsdatei statt im Code. |
| 3 | Divergenz-Anteil | **15 %** | Unverändert. Der Regressionstest in `tests/deck.test.ts` misst, was der Parameter tatsächlich bewirkt: ohne Injektion fällt die Stilvarianz der letzten 20 Karten messbar ab. |
| 4 | Sehr seltene Nachnamen | **Regeltabelle im Client, kein serverseitiger Fallback** | Die Regeln decken auch unbekannte Nachnamen ab — sie brauchen kein Wörterbuch, nur Buchstaben. Ein espeak-Endpunkt wäre eine Netzabhängigkeit für einen Gewinn, den wir nicht messen konnten. Die Grenze ist die Betonung, nicht die Lautschrift, und die fließt nur in eine einzige weiche Regel ein. |
| 5 | Match-Benachrichtigung | **gebündelt am Abend, maximal eine pro Tag und Person** | Das PRD nennt beides als vertretbar. Gebündelt gewinnt, weil sofortige Benachrichtigungen den anderen beim Swipen unterbrechen — und wer unterbrochen wird, bewertet die nächste Karte nicht mehr blind. Kernprinzip 2 schlägt Befriedigung. |
| 6 | Modus A oder B | **Modus A (Eigengebrauch), `DISTRIBUTION_SAFE=false`** | Der Wechsel ist ein Umgebungsschalter. Alle benutzten Quellen sind bereits verbreitungsfähig, der Filter entfernt in Modus B derzeit nichts — geprüft in `tests/pipeline.test.ts` mit einem eingeschleusten Feld unter restriktiver Lizenz. |
| 7 | Gleichzeitiges Swipen erkennen | **nein** | Es gäbe nur zwei Reaktionen darauf: eine Anzeige („ihr swipet gerade beide") oder eine Synchronisierung der Decks. Die erste erzeugt Beobachtungsdruck, die zweite bricht die Blindheit. Beides widerspricht Kernprinzip 2. |

### Zusätzlich gesetzte Werte

- **Divergenz-Schwelle: 0.224 statt 0.5.** Ausführlich begründet unten unter
  „Abweichungen".
- **Erstnamen-Anteil, Achsengewichte, Elo-Parameter** — siehe
  `config/tuning.json`.

---

## Abweichungen vom PRD

Vier Stellen, an denen die Umsetzung nicht dem Buchstaben des PRD folgt. Jede
ist im Code an der Fundstelle kommentiert.

### 1. Divergenz-Schwelle: 0.5 ist unerreichbar

PRD 5.3.5 nennt zwei Verwendungen derselben `euklid_distanz`:

- in der Empfehlungsformel als `1 - distanz` — das verlangt einen Wert in
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

---

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
- **Bedeutungstexte für 73 Namen.** Bewusst: PRD 9.4 stuft Bedeutung als
  Nebenfeld ein und rät ausdrücklich davon ab, dort Zeit zu investieren, bevor
  die Klang-Engine steht.
- **Der SSE-Bus lebt im Prozess.** Bei mehreren Instanzen bräuchte es Redis
  Pub/Sub. Bei zwei Nutzern pro Raum zieht das nicht früh.
- **Push-Benachrichtigungen sind spezifiziert, aber nicht gebaut.** Die
  Bündelungslogik steht in der Konfiguration; es fehlt die Anbindung an einen
  Push-Dienst. In der App erscheinen Matches über den SSE-Stream.
- **Kein Offline-Cache im Service Worker.** Das Deck lädt 50 Karten vor und
  überbrückt damit Verbindungsabbrüche innerhalb einer Session, aber ein
  Neustart ohne Netz zeigt nichts.

## Was bewusst nicht gebaut wurde

Kein Teilen der Shortlist, keine Umfrage, kein Voting-Link, keine
Kompatibilitäts-Prozentzahl, kein Konfetti, kein rotes X bei Ablehnung. Alles
davon steht so im PRD, und alles davon hätte man versehentlich mitbauen können.

## Datenschutz

Ablehnungen verlassen niemals das eigene Konto in identifizierbarer Form. Der
einzige Weg, auf dem etwas über eine Ablehnung nach außen dringt, ist der
Veto-Zähler und der freiwillig geteilte Hinweis „bei einem Namen gab es eine
persönliche Assoziation" — beide ohne Namen. Der Raum ist durch jeden
Elternteil sofort und vollständig löschbar. Keine Analytics, keine Werbe-IDs,
`robots: noindex`.
