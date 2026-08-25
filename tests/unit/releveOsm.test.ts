import { describe, it, expect } from 'vitest'
import { parsePoiResponse, buildPoiQuery } from '../../src/core/poi.ts'
import { dateDeReleve, declareQuelqueChose } from '../../src/core/releveOsm.ts'

/**
 * Issue #285 — « la seule chose qui permette de juger ».
 *
 * `opening_hours` est ce qu'un contributeur a saisi **un jour**. Le lot
 * précédent a corrigé le mot — la fiche écrit « annoncé ouvert » et non
 * « ouvert » — mais « annoncé » ne dit toujours pas *quand*. En montagne, la
 * fermeture saisonnière est la règle et n'apparaît presque jamais dans le
 * tag : un horaire relevé en 2019 et un horaire relevé le mois dernier
 * s'affichaient exactement pareil.
 *
 * L'issue demande la date, et elle a raison : c'est elle qui transforme une
 * déclaration invérifiable en information qu'on peut peser.
 */
describe('la requête POI demande les métadonnées', () => {
  it('emploie `out meta center`, sans quoi aucune date ne revient', () => {
    const requete = buildPoiQuery([
      [4.5, 45.4],
      [4.51, 45.4],
    ])
    expect(requete).toContain('out meta center')
  })
})

describe('parsePoiResponse retient la date de relevé', () => {
  const reponse = {
    elements: [
      {
        type: 'node',
        id: 1,
        lat: 45.4,
        lon: 4.5,
        timestamp: '2019-03-12T08:30:00Z',
        tags: { amenity: 'drinking_water', name: 'Fontaine' },
      },
      {
        type: 'node',
        id: 2,
        lat: 45.41,
        lon: 4.5,
        tags: { tourism: 'viewpoint', name: 'Sans date' },
      },
    ],
  }

  it('lit `timestamp` quand il est là', () => {
    const pois = parsePoiResponse(reponse)
    expect(pois[0]!.details.osmUpdatedAt).toBe('2019-03-12T08:30:00Z')
  })

  it('rend `null` quand il n’y est pas, jamais une date inventée', () => {
    // Une réponse en cache d'avant ce changement n'a pas de `timestamp`.
    // Elle doit continuer à s'afficher, sans date plutôt qu'avec celle du
    // jour — qui ferait passer un relevé de 2019 pour tout frais.
    const pois = parsePoiResponse(reponse)
    expect(pois[1]!.details.osmUpdatedAt).toBeNull()
  })
})

describe('dateDeReleve', () => {
  it('rend la date en toutes lettres, sans heure', () => {
    // L'heure d'une modification OSM ne dit rien à personne, et allonge une
    // ligne déjà chargée.
    expect(dateDeReleve('2019-03-12T08:30:00Z')).toBe('relevé le 12/03/2019')
  })

  it('ne dit rien d’une date absente ou illisible', () => {
    expect(dateDeReleve(null)).toBeNull()
    expect(dateDeReleve('pas une date')).toBeNull()
    expect(dateDeReleve('')).toBeNull()
  })
})

describe('declareQuelqueChose', () => {
  const rien = {
    openingHours: null,
    phone: null,
    website: null,
    capacity: null,
    operator: null,
  }

  it('est faux pour un point qui n’annonce rien', () => {
    // « 250 m de détour — relevé le 12/03/2019 » n'apprend rien à personne,
    // et la date deviendrait le bruit qui empêche de la voir là où elle sert.
    expect(declareQuelqueChose(rien)).toBe(false)
  })

  it('est vrai dès qu’un seul champ est déclaré', () => {
    // Chacun est testé séparément : une condition à cinq branches recopiée
    // finit toujours par en oublier une (CLAUDE.md §4).
    for (const champ of [
      'openingHours',
      'phone',
      'website',
      'capacity',
      'operator',
    ] as const) {
      expect(declareQuelqueChose({ ...rien, [champ]: 'x' }), champ).toBe(true)
    }
  })
})
