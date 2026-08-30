// @vitest-environment jsdom
/*
  Sous jsdom : la tranche d'import lit le XML avec l'analyseur du document.
  Sans DOM, chaque fichier ressort « lecture impossible » — un trou du
  harnais déguisé en fichier illisible (#430, #431).
*/
import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * Importer ses propres itinéraires (#428, dernier tiers du bloc mort).
 *
 * `importCustomGpx` fait une centaine de lignes et n'avait aucun test
 * unitaire : c'est le gros des mutants sans couverture de `trancheImport.ts`.
 * Ce fichier prend les trois promesses que le code porte explicitement dans
 * ses commentaires — donc trois affirmations, au sens du §4bis.
 */

/** Un GPX à `n` traces nommées, chacune de deux points. */
function gpxAvecTraces(noms: (string | null)[]): string {
  const traces = noms
    .map((nom, i) => {
      const lon = 4.5 + i * 0.01
      return `<trk>${nom === null ? '' : `<name>${nom}</name>`}<trkseg>
        <trkpt lat="45.4000" lon="${lon.toFixed(4)}"></trkpt>
        <trkpt lat="45.4010" lon="${(lon + 0.002).toFixed(4)}"></trkpt>
      </trkseg></trk>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  ${traces}
</gpx>`
}

/** Un GeoJSON à deux sentiers sans nom, de deux points chacun. */
function geoJsonSansNoms(): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [0, 1].map((i) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [4.5 + i * 0.01, 45.4],
          [4.502 + i * 0.01, 45.401],
        ],
      },
    })),
  })
}

describe('importer ses propres itinéraires', () => {
  it('quitte la démonstration au premier vrai fichier', async () => {
    const { deps, appels, etat } = espionner()

    await trancheImport(deps).importCustomGpx([
      new File([gpxAvecTraces(['Mon sentier'])], 'a-moi.gpx'),
    ])

    expect(
      etat().importErrors,
      'le fichier devait se lire : sans quoi ce test ne mesure rien',
    ).toEqual([])
    expect(etat().customItineraries).toHaveLength(1)
    /*
      « Maintenant, importez les vôtres » : la démonstration s'efface au
      premier vrai fichier, sinon les tracés de démonstration restent mêlés
      aux siens sans que rien ne les distingue.
    */
    expect(appels.sortirDeLaDemonstration).toBe(1)
  })

  it('garde la source du fichier, et dit que l’itinéraire est importé', async () => {
    /*
      Ce n'est pas du confort : le commentaire de `trancheImport.ts` cite
      l'issue #87 et la Licence Ouverte. Un PDIPR importé s'exportait en GPX
      **sans attribution**, ce que la licence interdit.

      `importe` distingue un fichier déposé d'un tracé dessiné dans
      l'application : les deux sont `PERSO`, et sans ce drapeau rien ne
      permet de dire « celui-ci vient de quelque part, et sa source manque ».

      Deux champs, donc, et une obligation derrière chacun.
    */
    const { deps, etat } = espionner()

    await trancheImport(deps).importCustomGpx([
      new File([gpxAvecTraces(['Sentier du Pilat'])], 'pdipr.gpx'),
    ])

    const [itineraire] = etat().customItineraries
    expect(itineraire).toBeDefined()
    expect(
      itineraire?.importe,
      'sans ce drapeau, un fichier déposé ne se distingue plus d’un tracé' +
        ' dessiné — et sa source manquante ne se voit pas',
    ).toBe(true)
    expect(itineraire?.network).toBe('PERSO')
    // Les identifiants perso sont négatifs : ils ne doivent jamais heurter
    // une relation OSM, dont les identifiants sont positifs.
    expect(itineraire?.osmRelationId).toBeLessThan(0)
  })

  it('donne un nom distinct à chaque sentier d’un même fichier', async () => {
    /*
      « Un GeoJSON peut décrire cent sentiers : chacun garde son nom, et à
      défaut le fichier suivi de son rang — sans quoi la liste afficherait
      cent fois la même ligne. »

      Le fichier ci-dessous n'en nomme aucun : c'est le cas du repli, celui
      que le commentaire promet. Deux sentiers anonymes doivent ressortir
      « sans-noms (1) » et « sans-noms (2) », pas deux fois « sans-noms ».

      Et c'est bien un GeoJSON, pas un GPX : ma première version mettait deux
      `<trk>` dans un GPX et n'obtenait **qu'un** itinéraire à deux lignes.
      Le commentaire du code dit « un GeoJSON peut décrire cent sentiers » —
      il nommait le bon format, et je ne l'avais pas lu d'assez près.
    */
    const { deps, etat } = espionner()

    await trancheImport(deps).importCustomGpx([
      new File([geoJsonSansNoms()], 'sans-noms.geojson'),
    ])

    const noms = etat().customItineraries.map((i) => i.name)
    expect(noms, 'deux sentiers anonymes ne peuvent pas porter le même nom').toEqual([
      'sans-noms (1)',
      'sans-noms (2)',
    ])
    // Et leurs identifiants diffèrent, sans quoi le second écraserait le
    // premier en base.
    const ids = etat().customItineraries.map((i) => i.osmRelationId)
    expect(new Set(ids).size).toBe(2)
  })
})
