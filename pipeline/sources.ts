/**
 * Quellenregister der Build-Pipeline.
 *
 * PRD 9.1, bindende Anweisung 1: "Jeder Datensatz bekommt in der Pipeline ein
 * Feld `source_id` und `license`, das bis in den fertigen Korpus durchgereicht
 * wird." Dieses Register ist die einzige Stelle, an der Lizenzinformationen
 * gepflegt werden; `ATTRIBUTIONS.md` wird daraus generiert (Anweisung 3).
 */

export interface SourceDefinition {
  id: string
  title: string
  publisher: string
  url: string
  license: string
  licenseUrl: string
  /** Pflichttext bei CC BY; leer bei DL-DE-Zero */
  attribution: string
  /**
   * Darf das aus dieser Quelle abgeleitete Feld an Dritte ausgeliefert werden?
   * Steuert den Filter fuer `DISTRIBUTION_SAFE=true` (PRD 9.1, Anweisung 2).
   */
  distributionSafe: boolean
  status: 'implemented' | 'planned'
  note: string
}

export const SOURCES: Record<string, SourceDefinition> = {
  'berlin-vornamen': {
    id: 'berlin-vornamen',
    title: 'Liste der häufigen Vornamen in Berlin (2012–2023)',
    publisher: 'BerlinOnline GmbH, auf Basis von Daten des Landesamtes für Bürger- und Ordnungsangelegenheiten (LABO)',
    url: 'https://github.com/berlin/haeufige-vornamen-berlin',
    license: 'CC BY 3.0 DE',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/de/',
    attribution:
      'BerlinOnline GmbH, auf Basis von Daten des Berliner Landesamtes für Bürger- und Ordnungsangelegenheiten (LABO)',
    distributionSafe: true,
    status: 'implemented',
    note: 'Bereits bereinigt und anonymisiert. Spalte `position` erst ab 2017 (PRD 9.3.2).',
  },

  wikidata: {
    id: 'wikidata',
    title: 'Wikidata — Vornamen und Sprachverbreitung',
    publisher: 'Wikimedia Foundation',
    url: 'https://query.wikidata.org/',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
    distributionSafe: true,
    status: 'implemented',
    note: 'Liefert das Signal für die Achse `reach` (PRD 9.6). Optional — ohne Netz greift der regelbasierte Ersatz.',
  },

  'self-authored': {
    id: 'self-authored',
    title: 'Selbst formulierte Bedeutungs- und Herkunftstexte',
    publisher: 'Projekt „Zwei Listen"',
    url: '',
    license: 'proprietary-owned',
    licenseUrl: '',
    attribution: '',
    distributionSafe: true,
    status: 'implemented',
    note: 'PRD 9.4 — Behind the Name ist für ausgelieferte Apps nicht gedeckt, deshalb eigene Texte.',
  },

  curated: {
    id: 'curated',
    title: 'Handkuratierte Tabellen (Kalibrierungsset, Spitznamen, Reime, Schreibvarianten, Betonung)',
    publisher: 'Projekt „Zwei Listen"',
    url: '',
    license: 'proprietary-owned',
    licenseUrl: '',
    attribution: '',
    distributionSafe: true,
    status: 'implemented',
    note: 'PRD 9.7 und F6 — bewusst von Hand, nicht generiert.',
  },

  // --- Noch nicht angebunden ------------------------------------------------
  // Registriert, damit das Hinzufuegen ein Adapter ist und keine Architektur-
  // aenderung. Die Portale waren beim Bau nicht über eine stabile CKAN-API
  // erreichbar; siehe README, Abschnitt "Bekannte Lücken".
  'koeln-vornamen': {
    id: 'koeln-vornamen',
    title: 'Vornamen der Neugeborenen in Köln',
    publisher: 'Stadt Köln',
    url: 'https://www.offenedaten-koeln.de/',
    license: 'DL-DE-Zero 2.0',
    licenseUrl: 'https://www.govdata.de/dl-de/zero-2-0',
    attribution: '',
    distributionSafe: true,
    status: 'planned',
    note: 'Zeitreihe ab 2019. DL-DE-Zero ist der Idealfall: keine Namensnennungspflicht.',
  },
  'dortmund-vornamen': {
    id: 'dortmund-vornamen',
    title: 'Vornamen der Neugeborenen in Dortmund',
    publisher: 'Stadt Dortmund',
    url: 'https://opendata.ruhr/',
    license: 'DL-DE-Zero 2.0',
    licenseUrl: 'https://www.govdata.de/dl-de/zero-2-0',
    attribution: '',
    distributionSafe: true,
    status: 'planned',
    note: 'Ab 2021, CSV/JSON/JSONL/Parquet.',
  },
  'duesseldorf-vornamen': {
    id: 'duesseldorf-vornamen',
    title: 'Vornamen der Neugeborenen in Düsseldorf',
    publisher: 'Landeshauptstadt Düsseldorf',
    url: 'https://opendata.duesseldorf.de/',
    license: 'Open Data',
    licenseUrl: '',
    attribution: '',
    distributionSafe: true,
    status: 'planned',
    note: 'Ab 2008, Häufigkeit nach Position aufgeschlüsselt — für den Positionskorrekturfaktor wertvoll.',
  },
}

export function sourceOf(id: string): SourceDefinition {
  const s = SOURCES[id]
  if (!s) throw new Error(`Unbekannte source_id: ${id}`)
  return s
}
