# Quellen und Lizenzen

> Diese Datei wird von `pipeline/09-export.ts` aus den `source_id`-Feldern des Korpus
> erzeugt. Nicht von Hand bearbeiten — Änderungen gehören in `pipeline/sources.ts`.

Build-Modus: **A — Eigengebrauch** (`DISTRIBUTION_SAFE=false`)

## Verwendete Quellen

### Liste der häufigen Vornamen in Berlin (2012–2023)

- **Herausgeber:** BerlinOnline GmbH, auf Basis von Daten des Landesamtes für Bürger- und Ordnungsangelegenheiten (LABO)
- **Quelle:** https://github.com/berlin/haeufige-vornamen-berlin
- **Lizenz:** CC BY 3.0 DE (https://creativecommons.org/licenses/by/3.0/de/)
- **Pflichtangabe:** BerlinOnline GmbH, auf Basis von Daten des Berliner Landesamtes für Bürger- und Ordnungsangelegenheiten (LABO)
- **Hinweis:** Bereits bereinigt und anonymisiert. Spalte `position` erst ab 2017 (PRD 9.3.2).

### Handkuratierte Tabellen (Kalibrierungsset, Spitznamen, Reime, Schreibvarianten, Betonung)

- **Herausgeber:** Projekt „Zwei Listen"
- **Lizenz:** proprietary-owned
- **Hinweis:** PRD 9.7 und F6 — bewusst von Hand, nicht generiert.

### Selbst formulierte Bedeutungs- und Herkunftstexte

- **Herausgeber:** Projekt „Zwei Listen"
- **Lizenz:** proprietary-owned
- **Hinweis:** PRD 9.4 — Behind the Name ist für ausgelieferte Apps nicht gedeckt, deshalb eigene Texte.

### Wikidata — Vornamen und Sprachverbreitung

- **Herausgeber:** Wikimedia Foundation
- **Quelle:** https://query.wikidata.org/
- **Lizenz:** CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
- **Hinweis:** Liefert das Signal für die Achse `reach` (PRD 9.6). Optional — ohne Netz greift der regelbasierte Ersatz.

## Registriert, aber nicht angebunden

- Vornamen der Neugeborenen in Köln — DL-DE-Zero 2.0, https://www.offenedaten-koeln.de/
- Vornamen der Neugeborenen in Dortmund — DL-DE-Zero 2.0, https://opendata.ruhr/
- Vornamen der Neugeborenen in Düsseldorf — Open Data, https://opendata.duesseldorf.de/
