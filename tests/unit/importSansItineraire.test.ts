// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * Ce que l'import dit quand un fichier ne donne rien.
 *
 * ## D'où vient ce fichier
 *
 * De la vague du 31/08. Tout le chemin de l'échec d'`importCustomGpx` était
 * **sans un seul mutant couvert** : la garde « pas assez de points », le
 * `catch` du fichier illisible, le dépôt des messages dans l'état, et
 * `clearImportErrors` qui n'était exécutée par rien.
 *
 * C'est le chemin qu'une personne emprunte au pire moment — Léa dépose le
 * PDIPR de son département et il ne se passe rien —, et c'était celui que
 * personne ne regardait.
 *
 * ## Ce qui rend ces messages fragiles
 *
 * Ils sont **cumulés**, pas remplacés : `[...state.importErrors, ...errors]`.
 * Un second import raté doit donc ajouter au premier, et `clearImportErrors`
 * est le seul moyen de vider la liste. Un mutant qui remplace au lieu
 * d'ajouter ne se voit qu'en important deux fois — ce qu'aucun test ne
 * faisait.
 */

/** Un fichier que la lecture refusera : ni GPX, ni GeoJSON, ni rien. */
const illisible = () =>
  new File(['ceci n’est pas une trace'], 'notes.gpx', {
    type: 'application/gpx+xml',
  })

/**
 * Un GPX bien formé, avec un seul point.
 *
 * **Le format compte, et je m'y suis fait prendre.** Ma première version
 * était un GeoJSON à une ligne d'un point : le test passait, mais pas par le
 * chemin que je croyais. `core/geojson.ts:110` écarte déjà les lignes de
 * moins de deux points, donc `trails` ressortait vide et la garde
 * `trail.lines.some((ligne) => ligne.length >= 2)` n'était jamais exercée —
 * l'injection qui la retire restait verte.
 *
 * Un GPX passe par l'autre lecteur, et `store/lecture.ts:175` rend
 * `lines: [trace.points]` **sans filtre de longueur**. C'est là, et là
 * seulement, que cette garde sert à quelque chose.
 *
 * Le §1bis dit qu'une assertion qui pourrait passer pour une raison qu'on
 * n'a pas voulue n'est pas une assertion. Celle-ci en était une.
 */
const sansAssezDePoints = () =>
  new File(
    [
      `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Un point isolé</name><trkseg>
    <trkpt lat="45.75" lon="4.8"><ele>300</ele></trkpt>
  </trkseg></trk>
</gpx>`,
    ],
    'presque-rien.gpx',
    { type: 'application/gpx+xml' },
  )

/** Un GeoJSON exploitable, pour les cas où l'import doit aussi réussir. */
const utilisable = (nom: string) =>
  new File(
    [
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Le tour du bois' },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [4.8, 45.75],
                  [4.8001, 45.75],
                ],
              ],
            },
          },
        ],
      }),
    ],
    nom,
    { type: 'application/geo+json' },
  )

describe('un fichier dont on ne peut rien tirer', () => {
  it('le dit, en nommant le fichier', async () => {
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([sansAssezDePoints()])

    expect(
      etat().importErrors,
      'un fichier sans assez de points disparaissait en silence : rien' +
        ' n’apparaissait, et rien n’expliquait pourquoi.',
    ).toEqual([
      'presque-rien.gpx : pas assez de points pour en faire un itinéraire.',
    ])
    expect(etat().customItineraries).toEqual([])
  })

  it('un fichier illisible se dit aussi, et n’interrompt pas les autres', async () => {
    /*
      Le `catch` est dans la boucle, pas autour : un fichier raté ne doit pas
      emporter les suivants. Sans les deux fichiers dans le même appel, le
      test ne distingue pas « attrapé » de « la boucle s'est arrêtée là ».
    */
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([
      illisible(),
      utilisable('bon.geojson'),
    ])

    expect(etat().importErrors).toHaveLength(1)
    expect(etat().importErrors[0]).toContain('notes.gpx')
    expect(
      etat().customItineraries.map((i) => i.name),
      'un premier fichier illisible emportait les suivants avec lui.',
    ).toEqual(['Le tour du bois'])
  })

  it('laisse l’état de progression au repos, quoi qu’il arrive', async () => {
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([illisible()])
    expect(
      etat().importProgress,
      'la barre de progression restait affichée après un import entièrement' +
        ' raté : l’application avait l’air de travailler encore.',
    ).toBeNull()
  })
})

describe('les messages d’import s’accumulent, et se vident sur demande', () => {
  it('un second échec s’ajoute au premier', async () => {
    // Mutant visé : le remplacement au lieu du cumul. Il ne se voit qu'en
    // important deux fois.
    const { deps, etat } = espionner()
    const actions = trancheImport(deps)
    await actions.importCustomGpx([sansAssezDePoints()])
    await actions.importCustomGpx([illisible()])

    expect(
      etat().importErrors,
      'le second import effaçait le message du premier : on ne voyait que la' +
        ' dernière raison, et jamais la liste de ce qui avait échoué.',
    ).toHaveLength(2)
  })

  it('clearImportErrors les retire', async () => {
    const { deps, etat } = espionner()
    const actions = trancheImport(deps)
    await actions.importCustomGpx([sansAssezDePoints()])
    expect(etat().importErrors).toHaveLength(1)

    actions.clearImportErrors()
    expect(
      etat().importErrors,
      'le seul moyen de faire disparaître un message d’erreur ne le faisait' +
        ' pas disparaître.',
    ).toEqual([])
  })

  it('un import qui réussit n’efface pas les messages d’un import raté', async () => {
    /*
      Ils ne sont pas remis à zéro à l'entrée : une réussite qui suit un échec
      ne doit pas faire oublier l'échec, sinon la personne qui déposait dix
      fichiers d'un coup ne saurait jamais lequel a manqué.
    */
    const { deps, etat } = espionner()
    const actions = trancheImport(deps)
    await actions.importCustomGpx([illisible()])
    await actions.importCustomGpx([utilisable('bon.geojson')])

    expect(etat().importErrors).toHaveLength(1)
    expect(etat().customItineraries).toHaveLength(1)
  })
})
