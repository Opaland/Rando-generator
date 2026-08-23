import { describe, it, expect } from 'vitest'
import { buildPoiQuery, parsePoiResponse } from '../../src/core/poi.ts'
import { couchagesLeLongDuTrace } from '../../src/core/stages.ts'
import { POI_LABELS, POI_OVERNIGHT } from '../../src/lib/poiDisplay.ts'
import type { LonLat, PointOfInterest } from '../../src/core/types.ts'

/**
 * Les gîtes d'étape (demande de Cédric, 23/08).
 *
 * > « pour les GR et GRP et les coupure faut faire les refuges ou préciser
 * > les gites étapes (exemple chemin de saint jacques de compostelle) »
 *
 * Le découpage en étapes se cale sur les couchages depuis #161, et
 * `couchagesLeLongDuTrace` n'acceptait que `hut` et `bivouac` — c'est-à-dire
 * le vocabulaire de la montagne. Sur le chemin de Saint-Jacques il n'y a ni
 * refuge gardé ni cabane : on dort en **gîte d'étape**, et la requête
 * Overpass ne les demandait pas du tout. Résultat : quatre cents kilomètres
 * découpés au kilomètre, sans qu'aucune coupure ne tombe où l'on dort.
 *
 * ## Le tag, et ce qui a été écarté
 *
 * `tourism=hostel` : c'est ce que le wiki OpenStreetMap français recommande
 * pour un gîte d'étape — un bâtiment à dortoirs et chambres partagées, par
 * opposition à `tourism=alpine_hut`, réservé au refuge de montagne isolé et
 * gardé.
 *
 * Écartés, et il faut dire pourquoi plutôt que de les ajouter en silence :
 *
 * - `tourism=guest_house` (chambre d'hôtes) et `tourism=chalet` (location
 *   saisonnière) hébergent aussi des pèlerins, mais ils noieraient tout
 *   tracé passant par un bourg sous des adresses qui ne sont pas des étapes
 *   de randonnée ;
 * - `tourism=hotel`, pour la même raison, en pire.
 *
 * **Ce choix n'est pas mesuré.** Compter ce que chaque tag rapporte
 * réellement le long du GR 65 demandait une requête Overpass sur le corridor
 * réel, que la politique réseau de la machine de développement interdit. Ce
 * qui manque pour trancher mieux : cette mesure-là, et elle se refait en dix
 * minutes depuis un poste ordinaire.
 */

const TRACE: LonLat[] = [
  [1.44, 44.45],
  [1.45, 44.46],
]

function reponse(tags: Record<string, string>): unknown {
  return { elements: [{ type: 'node', id: 1, lat: 44.45, lon: 1.44, tags }] }
}

describe('les gîtes d’étape', () => {
  it('sont demandés à Overpass', () => {
    expect(buildPoiQuery(TRACE)).toContain('hostel')
  })

  it('sont reconnus, et distincts d’un refuge gardé', () => {
    const [gite] = parsePoiResponse(
      reponse({ tourism: 'hostel', name: 'Gîte d’étape de Cajarc' }),
    )
    expect(gite?.kind).toBe('gite')
    expect(gite?.name).toBe('Gîte d’étape de Cajarc')

    const [refuge] = parsePoiResponse(
      reponse({ tourism: 'alpine_hut', name: 'Refuge du Goûter' }),
    )
    expect(refuge?.kind).toBe('hut')
  })

  it('gardent leurs informations pratiques, qui décident de l’étape', () => {
    const [gite] = parsePoiResponse(
      reponse({
        tourism: 'hostel',
        name: 'Gîte communal',
        phone: '+33 5 65 00 00 00',
        'capacity:beds': '18',
      }),
    )
    expect(gite?.details.phone).toBe('+33 5 65 00 00 00')
    expect(gite?.details.capacity).toBe('18')
  })

  it('portent un libellé qui dit ce que c’est', () => {
    expect(POI_LABELS.gite).toBe('Gîte d’étape')
  })

  /**
   * Un gîte se réserve, et il ferme. `POI_OVERNIGHT` répond à une autre
   * question — « où puis-je dormir ce soir sans avoir rien prévu » — et y
   * faire entrer un gîte laisserait croire qu'on peut s'y présenter.
   */
  it('ne rejoignent pas les couchages sans réservation', () => {
    expect(POI_OVERNIGHT).not.toContain('gite')
  })
})

function poi(kind: PointOfInterest['kind'], lon: number, nom: string): PointOfInterest {
  return {
    id: `node/${nom}`,
    lon,
    lat: 44.45,
    kind,
    name: nom,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

/** Un bout de chemin d'ouest en est, à latitude constante. */
const CHEMIN: LonLat[] = Array.from({ length: 40 }, (_, i) => [
  1.4 + i * 0.01,
  44.45,
])

describe('le découpage en étapes', () => {
  it('compte un gîte d’étape comme un couchage', () => {
    const couchages = couchagesLeLongDuTrace(
      [poi('gite', 1.6, 'Gîte de Limogne')],
      CHEMIN,
    )
    expect(couchages.map((c) => c.nom)).toEqual(['Gîte de Limogne'])
  })

  /**
   * Le cas de Cédric, en petit : un chemin sans le moindre refuge, où seuls
   * les gîtes disent où s'arrêter. Avant, la liste était vide et le
   * découpage retombait au kilomètre.
   */
  it('range gîtes et refuges ensemble, dans l’ordre du parcours', () => {
    const couchages = couchagesLeLongDuTrace(
      [
        poi('gite', 1.7, 'Gîte de Cahors'),
        poi('hut', 1.5, 'Refuge du Causse'),
        poi('gite', 1.6, 'Gîte de Limogne'),
      ],
      CHEMIN,
    )
    expect(couchages.map((c) => c.nom)).toEqual([
      'Refuge du Causse',
      'Gîte de Limogne',
      'Gîte de Cahors',
    ])
  })

  /**
   * Un abri météo reste hors du compte : la distinction vient de #161 et
   * elle ne bouge pas. Y caler une étape enverrait dormir où l'on ne dort
   * pas.
   */
  it('laisse toujours l’abri météo dehors', () => {
    expect(couchagesLeLongDuTrace([poi('shelter', 1.6, 'Abri')], CHEMIN)).toEqual(
      [],
    )
  })
})
