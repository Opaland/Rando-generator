// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport, type EtatPartage } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'
import type { Itinerary } from '../../src/core/types.ts'

/**
 * Les identifiants de chemin des itinéraires importés (issue #440).
 *
 * ## Le défaut
 *
 * `osmWayId: nextId * 1_000 - index` réservait mille identifiants par
 * itinéraire. Au mille-et-unième tronçon, on entrait dans la plage du
 * suivant :
 *
 *     tracé nextId=-1, 1001 lignes  →  -1000 … -2000
 *     tracé nextId=-2, 3 lignes     →  -2000 … -2002
 *                                       ^^^^^ collision
 *
 * `osmWayId` est une **clef de carte**, et les cartes portent sur tous les
 * itinéraires d'un même rendu : `mapdata.ts:230` fait dessiner le tronçon du
 * second avec les coordonnées du premier, `mapdata.ts:211` l'attribue au
 * mauvais itinéraire, et `matching.ts:92` crédite la progression de l'un à
 * l'autre. C'est la famille de #151, sauf qu'ici les deux sentiers ne sont
 * même pas proches.
 *
 * ## Pourquoi mille et pas autre chose
 *
 * Pour aucune raison écrite. C'était un plafond inventé qui décidait quand
 * deux itinéraires se confondent — un seuil qui change ce qui est calculé,
 * ce que le §2 interdit. Le remède n'est pas de l'agrandir : c'est de
 * n'avoir plus de plafond du tout.
 *
 * ## Ce que ce fichier ne prétend pas
 *
 * Qu'un tel fichier ait été observé. Il faut une *feature* GeoJSON à plus de
 * mille tronçons, suivie d'une autre — la forme d'un PDIPR départemental
 * publié en géométrie fusionnée, le cas de Léa (#87), pas le cas courant.
 * Ce qui est établi ici, c'est l'arithmétique et sa conséquence.
 */

/** Une ligne à deux points, valide et minuscule. */
const ligne = (n: number): [number, number][] => [
  [4.8 + n * 1e-5, 45.75],
  [4.8 + n * 1e-5 + 1e-5, 45.75],
]

/**
 * Un GeoJSON à deux tracés, dont le premier porte `tronconsDuPremier`
 * parties. C'est la forme minimale qui met les deux plages au contact.
 */
function fichierADeuxTraces(tronconsDuPremier: number): File {
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Le réseau fusionné' },
        geometry: {
          type: 'MultiLineString',
          coordinates: Array.from({ length: tronconsDuPremier }, (_, i) =>
            ligne(i),
          ),
        },
      },
      {
        type: 'Feature',
        properties: { name: 'La boucle du vallon' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [ligne(90_000), ligne(90_001), ligne(90_002)],
        },
      },
    ],
  }
  return new File([JSON.stringify(geo)], 'pdipr.geojson', {
    type: 'application/geo+json',
  })
}

/** Tous les identifiants de chemin posés, tous itinéraires confondus. */
function identifiants(itineraires: Itinerary[]): number[] {
  return itineraires.flatMap((i) => i.ways.map((w) => w.osmWayId))
}

async function importer(fichier: File, depart: Partial<EtatPartage> = {}) {
  const { deps, etat } = espionner(depart)
  await trancheImport(deps).importCustomGpx([fichier])
  return etat().customItineraries
}

describe('deux itinéraires importés ne se partagent aucun identifiant', () => {
  it('sur un fichier ordinaire', async () => {
    const itineraires = await importer(fichierADeuxTraces(3))
    expect(itineraires).toHaveLength(2)
    const ids = identifiants(itineraires)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('quand le premier tracé dépasse mille tronçons', async () => {
    /*
      LE test de ce fichier. Sous l'ancien calcul, le premier tracé occupait
      -1000 … -2000 et le second repartait à -2000 : le dernier tronçon de
      l'un et le premier de l'autre portaient le même numéro.
    */
    const itineraires = await importer(fichierADeuxTraces(1001))
    const ids = identifiants(itineraires)
    const doublons = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(
      doublons,
      'deux tronçons d’itinéraires différents portaient le même identifiant :' +
        ' la carte dessinait l’un avec les coordonnées de l’autre, et la' +
        ' progression se créditait au mauvais itinéraire (#440, famille #151).',
    ).toEqual([])
    expect(new Set(ids).size).toBe(1001 + 3)
  })

  it('ne réutilise pas les identifiants déjà en base', async () => {
    /*
      Un import n'est pas le premier : les itinéraires déjà importés portent
      leurs propres identifiants, et le compteur doit repartir dessous. La
      garde existait pour les relations (`Math.min(0, …osmRelationId)`) et
      pas pour les chemins.
    */
    const dejaLa: Itinerary = {
      osmRelationId: -1,
      ref: null,
      name: 'Un import précédent',
      network: 'PERSO',
      ways: [
        { osmWayId: -1000, coords: ligne(500) },
        { osmWayId: -1001, coords: ligne(501) },
      ],
      totalMeters: 2,
      fetchedAt: '2026-08-30T00:00:00.000Z',
      importe: true,
    }

    const tous = await importer(fichierADeuxTraces(3), {
      customItineraries: [dejaLa],
    })
    /*
      `importer` rend l'état entier, `dejaLa` compris : c'est lui qui porte
      -1000 et -1001. Ne regarder que les nouveaux — sinon l'assertion
      échouerait en montrant du doigt l'itinéraire d'avant, pour une raison
      qu'on n'a pas voulue (§1bis). Elle l'a fait au premier essai.
    */
    const neufs = tous.filter((i) => i.osmRelationId !== -1)
    const ids = identifiants(neufs)
    expect(
      ids.filter((id) => id === -1000 || id === -1001),
      'un second import reprenait les identifiants de chemin du premier :' +
        ' les deux se confondaient sur la carte.',
    ).toEqual([])
    expect(Math.max(...ids)).toBeLessThan(-1001)
  })
})
