import { describe, it, expect } from 'vitest'
import { faitsDeSortie } from '../../src/core/faitsDeSortie.ts'
import { MAX_ITINERAIRES_DE_SORTIE, type OutingHighlight } from '../../src/core/outing.ts'
import type { Itinerary, LonLat, Track } from '../../src/core/types.ts'

/**
 * Issue #673, deuxième usage — le récit d'une sortie. Comme pour le bilan
 * de saison, ce module calcule tout ce que Claude a le droit d'écrire, et
 * l'objet rendu est exactement ce qui part. Ce qui n'en fait jamais partie :
 * coordonnées, nom de fichier, date plus fine que le mois, et le nom d'un
 * itinéraire que l'utilisateur a créé ou importé lui-même (réseau PERSO).
 */
const points: LonLat[] = Array.from({ length: 21 }, (_, i) => [i * 0.01, 0])

const trace: Track = {
  id: 't1',
  filename: 'chez-mamie-samedi.gpx',
  points,
  date: '2026-06-14T08:00:00Z',
  importedAt: '2026-06-15T08:00:00Z',
  elevationGain: 812.4,
}

function itineraire(id: number, name: string, network: Itinerary['network']): Itinerary {
  return {
    osmRelationId: id,
    name,
    ref: null,
    network,
    ways: [],
  } as unknown as Itinerary
}

const itineraires = [
  itineraire(1, 'GR 7', 'GR'),
  itineraire(2, 'Boucle de la cabane de Mamie', 'PERSO'),
]
const faits: OutingHighlight[] = [
  { itineraryId: 1, name: 'GR 7', doneMeters: 8_456, pct: 4.27 },
  { itineraryId: 2, name: 'Boucle de la cabane de Mamie', doneMeters: 3_000, pct: 60 },
]

describe('faitsDeSortie', () => {
  it('donne la longueur, le dénivelé et le mois', () => {
    const f = faitsDeSortie(trace, faits, itineraires)
    expect(f.mois).toBe('juin 2026')
    expect(f.km).toBeCloseTo(22.2, 1)
    expect(f.deniveleM).toBe(812)
  })

  it('nomme les itinéraires publics avancés, avec ce que la sortie y a fait', () => {
    expect(faitsDeSortie(trace, faits, itineraires).itineraires).toEqual([
      { nom: 'GR 7', kmParcourus: 8.5, pctDeLItineraire: 4.3 },
    ])
  })

  /*
    Relecture adverse du 12/11 : la fiche garde les cinq premiers avant que
    les itinéraires personnels ne soient écartés. Une liste vide ne dit donc
    pas « aucun » — et le modèle ne doit pas pouvoir l'écrire.
  */
  it('dit qu’il y a d’autres itinéraires avancés quand certains ne sont pas nommés', () => {
    expect(faitsDeSortie(trace, faits, itineraires).autresItinerairesNonNommes).toBe(true)
    expect(faitsDeSortie(trace, faits.slice(0, 1), itineraires).autresItinerairesNonNommes).toBe(false)
  })

  it('le dit aussi quand la fiche a atteint sa limite', () => {
    const cinq = Array.from({ length: MAX_ITINERAIRES_DE_SORTIE }, (_, i) => ({
      itineraryId: 1,
      name: 'GR 7',
      doneMeters: 1000 + i,
      pct: 1,
    }))
    expect(faitsDeSortie(trace, cinq, itineraires).autresItinerairesNonNommes).toBe(true)
  })

  it('n’envoie jamais un itinéraire créé ou importé par l’utilisateur', () => {
    expect(JSON.stringify(faitsDeSortie(trace, faits, itineraires))).not.toMatch(/Mamie|cabane/)
  })

  it('n’emporte ni coordonnées, ni nom de fichier, ni jour', () => {
    const texte = JSON.stringify(faitsDeSortie(trace, faits, itineraires))
    expect(texte).not.toMatch(/chez-mamie|\.gpx|14|2026-06/)
    expect(texte).not.toMatch(/points|\[\s*-?\d+\.\d+\s*,/)
  })

  it('dit qu’une sortie sans date n’a pas de mois, et sans altitudes pas de dénivelé', () => {
    const f = faitsDeSortie({ ...trace, date: null, elevationGain: null }, [], itineraires)
    expect(f.mois).toBeNull()
    expect(f.deniveleM).toBeNull()
    expect(f.itineraires).toEqual([])
    expect(f.autresItinerairesNonNommes).toBe(false)
  })
})
