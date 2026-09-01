// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheFiche, FICHE_FERMEE } from '../../src/store/trancheFiche.ts'
import type { ProfilePoint } from '../../src/core/elevation.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Viser un endroit sur la carte : les deux paires demande / acquittement.
 *
 * ## D'où vient ce fichier
 *
 * Second tas des mutants de `trancheFiche.ts`, annoncé dans la PR #444 :
 * `setElevationHover`, `focusOn`, `clearFocusTarget`, `focusOnBounds` et
 * `clearFocusBounds` étaient **sans un seul mutant couvert**. Aucun test
 * unitaire ne les exécutait.
 *
 * ## Ce ne sont pas des accesseurs, ce sont des contrats
 *
 * On lit quatre affectations d'une ligne, et on est tenté de hausser les
 * épaules. Mais `focusTarget` et `focusBounds` ne sont pas des champs
 * d'état ordinaires : ce sont des **demandes à usage unique**, et le
 * commentaire de `useMapCamera.ts:131` le dit — « consommé une seule fois :
 * on efface la cible aussitôt après usage ».
 *
 *     focusOn(point)         → la carte s'y déplace → clearFocusTarget()
 *     focusOnBounds(cadre)   → la carte s'y cadre   → clearFocusBounds()
 *
 * L'acquittement n'est pas du ménage. Sans lui, l'effet de `useMapCamera`
 * se redéclencherait à chaque rendu où la cible est encore posée, et la
 * carte reviendrait s'y coller — on ne pourrait plus la déplacer à la main
 * après avoir cliqué un point d'intérêt.
 *
 * C'est ce contrat que ce fichier garde, pas la valeur d'un champ.
 *
 * ## Les deux paires sont indépendantes, et c'est le mutant qui compte
 *
 * `ItineraryDetail.tsx` appelle les deux : `focusOn` sur un point d'intérêt
 * (ligne 812), `focusOnBounds` sur une étape (ligne 642). Un correctif qui
 * confondrait les deux effacements — `clearFocusTarget` remettant
 * `focusBounds` à zéro, ou l'inverse — annulerait le cadrage d'étape au
 * moment où on clique un point d'intérêt. Les deux tests croisés ci-dessous
 * existent pour ça.
 */

/** Le strict nécessaire, avec l'état que les cinq gestes touchent. */
function tranche() {
  const etat: Record<string, unknown> = {
    ...FICHE_FERMEE,
    focusTarget: null,
    focusBounds: null,
  }
  const deps = {
    set: (partiel: object) => {
      Object.assign(etat, partiel)
    },
    etatFiche: () => etat,
    itineraireParId: () => undefined,
    poisEmportes: () => Promise.resolve(null),
  } as unknown as Parameters<typeof trancheFiche>[0]
  return { actions: trancheFiche(deps), etat }
}

const SOURCE: LonLat = [4.83, 45.76]
const CADRE: [LonLat, LonLat] = [
  [4.8, 45.7],
  [4.9, 45.8],
]

describe('viser un point : la demande, puis son acquittement', () => {
  it('focusOn pose la cible que la carte ira chercher', () => {
    const { actions, etat } = tranche()
    actions.focusOn(SOURCE)
    expect(
      etat.focusTarget,
      'cliquer un point d’intérêt dans la fiche ne demandait rien à la carte :' +
        ' elle ne bougeait pas.',
    ).toEqual(SOURCE)
  })

  it('clearFocusTarget la retire, pour que la carte n’y revienne pas', () => {
    /*
      L'acquittement est le vrai sujet. `useMapCamera.ts:140` l'appelle juste
      après avoir déplacé la carte ; sans lui, son effet se redéclencherait
      tant que la cible est posée, et la carte reviendrait se coller au point
      dès qu'on essaierait de la déplacer à la main.
    */
    const { actions, etat } = tranche()
    actions.focusOn(SOURCE)
    actions.clearFocusTarget()
    expect(
      etat.focusTarget,
      'la cible restait posée après usage : la carte revenait s’y coller à' +
        ' chaque rendu, et on ne pouvait plus la déplacer.',
    ).toBeNull()
  })

  it('une seconde visée remplace la première', () => {
    const { actions, etat } = tranche()
    actions.focusOn(SOURCE)
    actions.focusOn([2.35, 48.85])
    expect(etat.focusTarget).toEqual([2.35, 48.85])
  })
})

describe('cadrer une étape : la seconde paire', () => {
  it('focusOnBounds pose le cadre', () => {
    const { actions, etat } = tranche()
    actions.focusOnBounds(CADRE)
    expect(
      etat.focusBounds,
      'cliquer une étape d’un long itinéraire ne cadrait rien : un point' +
        ' centré ne dit pas jusqu’où l’étape va.',
    ).toEqual(CADRE)
  })

  it('clearFocusBounds le retire', () => {
    const { actions, etat } = tranche()
    actions.focusOnBounds(CADRE)
    actions.clearFocusBounds()
    expect(etat.focusBounds).toBeNull()
  })
})

describe('les deux paires ne se marchent pas dessus', () => {
  /*
    `ItineraryDetail.tsx` appelle les deux — `focusOnBounds` sur une étape,
    `focusOn` sur un point d'intérêt. Un effacement qui déborderait sur
    l'autre demande annulerait le cadrage au pire moment.
  */
  it('effacer la cible ne défait pas le cadre', () => {
    const { actions, etat } = tranche()
    actions.focusOnBounds(CADRE)
    actions.focusOn(SOURCE)
    actions.clearFocusTarget()
    expect(
      etat.focusBounds,
      'acquitter une visée de point effaçait le cadrage d’étape demandé' +
        ' juste avant.',
    ).toEqual(CADRE)
  })

  it('effacer le cadre ne défait pas la cible', () => {
    const { actions, etat } = tranche()
    actions.focusOn(SOURCE)
    actions.focusOnBounds(CADRE)
    actions.clearFocusBounds()
    expect(etat.focusTarget).toEqual(SOURCE)
  })
})

describe('le survol du profil altimétrique', () => {
  /*
    La forme vient de `ProfilePoint` dans `core/elevation.ts`, lue plutôt
    qu'inventée — ma première version portait `distance` et des coordonnées
    à plat, et seul `tsc -b` l'a vue : vitest ne vérifie pas les types, et
    les neuf tests passaient sur une forme qui n'existe pas (§6).

    Ce qui compte ici est `point` : c'est lui qui relie le graphique à la
    carte. Un profil sans localisation ne dit pas *où* ça grimpe.
  */
  const POINT: ProfilePoint = {
    distanceMeters: 1200,
    elevation: 640,
    point: [4.83, 45.76],
  }

  it('pose le point survolé, pour que la carte le montre', () => {
    const { actions, etat } = tranche()
    actions.setElevationHover(POINT)
    expect(
      etat.elevationHover,
      'survoler la courbe d’altitude ne posait aucun marqueur sur le tracé :' +
        ' le lien entre le profil et la carte était rompu.',
    ).toEqual(POINT)
  })

  it('accepte null quand le doigt quitte la courbe', () => {
    // `ElevationChart.tsx:202` passe `null` dès que la borne sort du graphe.
    // Sans ce cas, le marqueur resterait planté où le doigt est passé.
    const { actions, etat } = tranche()
    actions.setElevationHover(POINT)
    actions.setElevationHover(null)
    expect(
      etat.elevationHover,
      'le marqueur restait sur le tracé après que le doigt a quitté la' +
        ' courbe.',
    ).toBeNull()
  })
})
