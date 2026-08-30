import { describe, it, expect } from 'vitest'
import { trancheZone, type DependancesZone } from '../../src/store/trancheZone.ts'

/**
 * Rafraîchir une zone « autour d'un lieu », quand la clé est abîmée.
 *
 * ## D'où vient ce fichier
 *
 * De la vague de mutation du 30/08, et de nulle part ailleurs. `trancheZone`
 * n'était **exécutée par aucun test unitaire** — deux fichiers la lisaient en
 * texte, aucun ne l'appelait —, d'où 51 mutants sans couverture et 84
 * survivants. Deux de ces survivants changent un résultat, et c'est ceux-là
 * que ce fichier tue :
 *
 *     !Number.isFinite(lon) || !Number.isFinite(lat)   →   &&
 *
 * Un `&&` ne rejette que si **les deux** moitiés sont mauvaises : une clé
 * dont une seule coordonnée est illisible passait alors la garde et partait
 * dans `loadAutour` avec un centre `[NaN, 45.75]`.
 *
 * ## Le survivant voisin, qui n'en est pas un
 *
 * `lon === undefined || lat === undefined → &&` survit **même à ces
 * tests**, et c'est normal : `Number.isFinite(undefined)` vaut `false`, donc
 * la ligne suivante attrape déjà tout ce que celle-là attraperait. Cette
 * ligne ne garde rien à l'exécution — elle rétrécit le type : `.map(Number)`
 * rend `number | undefined`, et `center: [lon, lat]` exige deux nombres. La
 * retirer casse `tsc`, vérifié.
 *
 * **Ce constat n'est écrit qu'ici, et pas dans le code**, parce que
 * `trancheZone.ts` occupe 539 de ses 540 lignes de plafond
 * (`plafondDuStore.test.ts`) : il ne reste pas une ligne pour un
 * commentaire. Le plafond a fait exactement ce pour quoi il existe — dire
 * non —, et ce n'était pas à un lot sur les mutants de décider de le
 * relever. Qui voudra « simplifier » cette ligne trouvera ce fichier : il
 * porte le nom de la fonction.
 *
 * ## Pourquoi ça peut arriver pour de vrai
 *
 * `autour:<lon>,<lat>` est une clé **relue au démarrage** : le commentaire
 * de `rafraichirZone` le dit — « la clé porte le centre de la recherche,
 * précisément pour qu'on puisse la rejouer sans avoir gardé le lieu
 * d'origine ». Elle vient donc du stockage, pas d'un appel que nous
 * contrôlons, et un stockage se tronque.
 */

/** Le strict nécessaire pour appeler la tranche, et rien de plus. */
function tranche(zoneKey: string) {
  const appels: { loadAutour: unknown[]; loadZone: unknown[] } = {
    loadAutour: [],
    loadZone: [],
  }
  const etat = {
    zoneKey,
    zoneLabel: 'Autour de Chaponost',
    demonstration: false,
  } as unknown as ReturnType<DependancesZone['etat']>

  const deps = {
    set: () => {},
    etat: () => etat,
    baseOuverte: () => Promise.resolve(null),
    persistLastZone: () => Promise.resolve(),
    recompute: () => Promise.resolve(),
    setItineraries: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone

  const actions = trancheZone(deps)
  /*
    On observe `loadAutour` en le remplaçant : c'est lui que la garde doit
    empêcher d'être appelé. Mesurer l'appel plutôt que l'état évite de
    dépendre de tout ce que `loadAutour` ferait ensuite.
  */
  actions.loadAutour = (lieu) => {
    appels.loadAutour.push(lieu)
    return Promise.resolve()
  }
  actions.loadZone = (cle) => {
    appels.loadZone.push(cle)
    return Promise.resolve()
  }
  return { actions, appels }
}

describe('rafraîchir une zone « autour », clé abîmée', () => {
  it('rejoue une clé bien formée', () => {
    const { actions, appels } = tranche('autour:4.8,45.75')
    return actions.rafraichirZone().then(() => {
      expect(appels.loadAutour).toHaveLength(1)
      expect(
        (appels.loadAutour[0] as { center: [number, number] }).center,
      ).toEqual([4.8, 45.75])
    })
  })

  it('refuse une clé à une seule coordonnée', async () => {
    // Refusée par la garde `isFinite`, pas par celle sur `undefined` : voir
    // l'en-tête de ce fichier.
    const { actions, appels } = tranche('autour:4.8')
    await actions.rafraichirZone()
    expect(
      appels.loadAutour,
      'une clé tronquée partait avec une latitude absente : le centre était' +
        ' `[4.8, undefined]`, et la zone se chargeait autour de nulle part.',
    ).toHaveLength(0)
  })

  it('refuse une clé dont une coordonnée n’est pas un nombre', async () => {
    // Mutant tué : `!Number.isFinite(lon) && !Number.isFinite(lat)`.
    const { actions, appels } = tranche('autour:abc,45.75')
    await actions.rafraichirZone()
    expect(
      appels.loadAutour,
      'une seule coordonnée illisible suffisait à produire un centre `[NaN,' +
        ' 45.75]`, parce que la garde n’exigeait que les deux le soient.',
    ).toHaveLength(0)
  })

  it('refuse une clé dont les deux coordonnées sont illisibles', async () => {
    // Le cas que la garde d'origine attrapait déjà : il reste gardé.
    const { actions, appels } = tranche('autour:abc,def')
    await actions.rafraichirZone()
    expect(appels.loadAutour).toHaveLength(0)
  })
})
