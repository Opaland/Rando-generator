import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'
import type { Itinerary, Track } from '../../src/core/types.ts'

/**
 * Supprimer une trace, supprimer un itinéraire perso (#428, bloc mort).
 *
 * La vague du 30/08 a montré `trancheImport.ts` à 45,62 %, avec ses mutants
 * sans couverture réunis en **un bloc contigu, lignes 305 à 427**. Trois
 * actions y vivaient sans qu'aucun test unitaire ne les appelle :
 * `importCustomGpx`, `removeTrack`, `removeCustomItinerary`.
 *
 * Elles passent par les tests de bout en bout — mais la mutation ne lance
 * que vitest, et un parcours d'interface prouve le chemin heureux là où un
 * test de tranche éprouve les embranchements pour trois lignes.
 *
 * Ce fichier prend les deux suppressions. `importCustomGpx` fait cent lignes
 * et mérite son propre lot.
 */

function piste(id: string): Track {
  return {
    id,
    name: `sortie ${id}`,
    date: '2024-06-15',
    points: [],
    distanceMeters: 0,
    source: 'gpx',
  } as unknown as Track
}

function itineraire(osmRelationId: number): Itinerary {
  return {
    osmRelationId,
    name: `itinéraire ${osmRelationId}`,
    network: 'PERSO',
    ways: [],
  } as unknown as Itinerary
}

describe('supprimer une trace', () => {
  it('l’efface de la base et de l’écran, puis recalcule', async () => {
    const { deps, appels, etat } = espionner({
      tracks: [piste('a'), piste('b')],
    })

    await trancheImport(deps).removeTrack('a')

    expect(appels.effaces).toEqual(['a'])
    expect(etat().tracks.map((t) => t.id)).toEqual(['b'])
    /*
      La complétion se recalcule : une trace en moins, ce sont des tronçons
      qui redeviennent à parcourir. L'oublier laisserait un pourcentage qui
      décrit une sortie qu'on vient d'effacer.
    */
    expect(appels.recompute).toBe(1)
  })
})

describe('supprimer un itinéraire perso', () => {
  it('ferme la fiche et désélectionne, quand c’est celui-là', async () => {
    const { deps, appels, etat } = espionner({
      customItineraries: [itineraire(1), itineraire(2)],
      selectedItineraryId: 1,
    })

    await trancheImport(deps).removeCustomItinerary(1)

    expect(appels.effaces).toEqual([1])
    expect(etat().customItineraries.map((i) => i.osmRelationId)).toEqual([2])
    expect(appels.fermerLaFicheSi).toEqual([1])
    expect(etat().selectedItineraryId).toBeNull()
  })

  it('laisse la sélection tranquille quand c’en est un autre', async () => {
    /*
      Le pendant, et c'est lui qui compte.

      La ligne écrit `state.selectedItineraryId === id ? null : state.selectedItineraryId`.
      Un mutant qui la remplace par `null` tout court passerait le test
      précédent sans broncher : supprimer l'itinéraire A désélectionnerait B,
      c'est-à-dire viderait la fiche de quelqu'un qui regardait autre chose.

      Une garde conditionnelle éprouvée d'un seul côté n'est pas éprouvée.
    */
    const { deps, appels, etat } = espionner({
      customItineraries: [itineraire(1), itineraire(2)],
      selectedItineraryId: 2,
    })

    await trancheImport(deps).removeCustomItinerary(1)

    expect(etat().customItineraries.map((i) => i.osmRelationId)).toEqual([2])
    expect(
      etat().selectedItineraryId,
      'supprimer un itinéraire ne doit pas fermer celui qu’on regarde',
    ).toBe(2)
    /*
      `fermerLaFicheSi` est bien appelée — c'est elle qui décide, pas nous —
      mais avec l'identifiant supprimé, et non celui qui est sélectionné.
    */
    expect(appels.fermerLaFicheSi).toEqual([1])
  })
})
