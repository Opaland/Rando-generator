// @vitest-environment jsdom
/*
  Sous jsdom, comme `tcx.test.ts` et `appStore.test.ts`.

  `src/core/gpx.ts` se veut « testable hors navigateur » et reçoit son
  analyseur par injection — mais la tranche d'import, elle, prend celui du
  document. Sans DOM, chaque fichier ressort « lecture impossible », et
  c'est le second test de ce fichier qui l'a dit avant que je le devine.
*/
import { describe, it, expect } from 'vitest'
import {
  IMPORT_AU_REPOS,
  trancheImport,
  type DependancesImport,
  type EtatImport,
  type EtatPartage,
} from '../../src/store/trancheImport.ts'

/**
 * Un import qui ne rapporte rien ne dépense pas la demande de persistance.
 *
 * ## Le survivant
 *
 * La vague du 30/08 (#428) a laissé vivre, sur la dernière ligne de
 * `importGpxFiles` :
 *
 *     if (imported.length > 0) await deps.protegerLeStockage()   →   >= 0
 *
 * Un `>= 0` est toujours vrai : la persistance serait demandée même quand
 * **aucun** fichier n'a pu être lu.
 *
 * ## Pourquoi celui-là compte
 *
 * `protegerLeStockage` n'est pas une écriture anodine. Il appelle
 * `demanderPersistance(apiDuNavigateur())` — c'est-à-dire
 * `navigator.storage.persist()` —, et il est **à un coup** : un drapeau
 * `persistanceDemandee` le verrouille après le premier appel.
 *
 * Certains navigateurs répondent à cette demande par une question posée à
 * la personne. La dépenser sur un import entièrement raté, c'est la poser
 * au pire moment — juste après un échec — et ne plus pouvoir la poser quand
 * l'import suivant réussira vraiment.
 *
 * Le code est juste ; c'est le test qui manquait. Aucune ligne de `src/` ne
 * change ici.
 */

interface Espion {
  deps: DependancesImport
  appels: { protegerLeStockage: number; recompute: number }
  etat: () => EtatImport & EtatPartage
}

/** Une tranche d'import branchée sur des dépendances qu'on peut observer. */
function espionner(): Espion {
  let etat: EtatImport & EtatPartage = {
    ...IMPORT_AU_REPOS,
    tracks: [],
    zoneLabel: null,
    customItineraries: [],
    selectedItineraryId: null,
  }
  const appels = { protegerLeStockage: 0, recompute: 0 }
  return {
    appels,
    etat: () => etat,
    deps: {
      set: (partiel) => {
        const suite = typeof partiel === 'function' ? partiel(etat) : partiel
        etat = { ...etat, ...suite }
      },
      etat: () => etat,
      // La base ne s'ouvre pas : ce test ne parle que de ce qui est lu, et
      // une trace illisible n'atteint jamais l'enregistrement de toute façon.
      baseOuverte: () => Promise.resolve(null),
      recompute: () => {
        appels.recompute += 1
        return Promise.resolve()
      },
      protegerLeStockage: () => {
        appels.protegerLeStockage += 1
        return Promise.resolve()
      },
      sortirDeLaDemonstration: () => Promise.resolve(),
      fermerLaFicheSi: () => {},
    },
  }
}

/**
 * Un GPX que le lecteur accepte — même forme que `buildGpx` des tests de
 * bout en bout : `xmlns` compris, sans quoi le fichier ressort « lecture
 * impossible » et le second test ne prouverait plus le contraire du premier.
 */
function gpxLisible(): string {
  const points: string[] = []
  for (let lon = 4.5; lon <= 4.53; lon += 0.002) {
    points.push(`<trkpt lat="45.4001350" lon="${lon.toFixed(4)}"></trkpt>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>2024-06-15T08:30:00Z</time></metadata>
  <trk><trkseg>${points.join('\n')}</trkseg></trk>
</gpx>`
}

describe('importer des fichiers illisibles', () => {
  it('ne demande pas la persistance quand rien n’a été importé', async () => {
    const { deps, appels, etat } = espionner()

    await trancheImport(deps).importGpxFiles([
      new File(['ceci n’est pas du GPX'], 'cassé.gpx'),
    ])

    /*
      D'abord : le fichier a-t-il vraiment échoué ?

      Sans cette ligne, un fichier qui se lirait quand même laisserait le
      test vert en ayant mesuré tout autre chose. C'est le §1bis — une
      assertion qui peut passer pour une raison qu'on n'a pas voulue n'en
      est pas une.
    */
    expect(
      etat().importErrors,
      'le fichier devait être refusé : sans échec, ce test ne mesure rien',
    ).toHaveLength(1)
    expect(etat().tracks).toHaveLength(0)

    expect(
      appels.protegerLeStockage,
      'la persistance est à un coup : la dépenser sur un import raté, c’est' +
        ' la perdre pour celui qui réussira',
    ).toBe(0)
    // Rien n'est entré : il n'y a rien à recalculer non plus.
    expect(appels.recompute).toBe(0)
  })

  it('la demande quand au moins un fichier est passé', async () => {
    /*
      Le pendant, sans lequel le test précédent serait content d'un
      `protegerLeStockage` qui ne s'appellerait **jamais** — une garde qui
      n'a plus d'occasion de se tromper n'est plus une garde.
    */
    const { deps, appels, etat } = espionner()

    await trancheImport(deps).importGpxFiles([
      new File([gpxLisible()], 'bonne.gpx'),
    ])

    expect(
      etat().importErrors,
      'ce GPX devait se lire : sinon le test ne prouve pas le contraire du premier',
    ).toHaveLength(0)
    expect(etat().tracks).toHaveLength(1)
    expect(appels.protegerLeStockage).toBe(1)
  })
})
