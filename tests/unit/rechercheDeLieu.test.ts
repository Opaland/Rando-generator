import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GeocodeError, type Lieu } from '../../src/core/geocode.ts'
import { trancheZone, type DependancesZone } from '../../src/store/trancheZone.ts'
import { trancheRecherche } from '../../src/store/rechercheDeLieu.ts'

/**
 * La recherche de lieu, et les deux compteurs qui doivent rester d'accord.
 *
 * ## D'où vient ce fichier
 *
 * De la vague de mutation sur `src/store`. `chercherLieu` était atteinte par
 * `appStore.test.ts` — sa course « la dernière demandée gagne » y est déjà
 * couverte —, mais quinze mutants y survivaient quand même, et
 * `effacerLieux` n'était exécutée par rien du tout.
 *
 * Ce que la course déjà écrite ne regardait pas : **le témoin de
 * chargement**. Elle assertait les résultats, jamais `lieuxLoading`. Le
 * `finally` entier pouvait donc être vidé sans qu'un test s'en aperçoive —
 * c'est-à-dire un champ de recherche qui tourne indéfiniment.
 *
 * ## Le survivant qui a fait écrire ce fichier
 *
 * `lieuSequence` est incrémenté par `chercherLieu` et par `effacerLieux`.
 * Deux endroits, un seul compteur : c'est la forme du §4ter, et elle a le
 * défaut de sa forme. Muter l'un des deux en soustraction :
 *
 *     const sequence = ++lieuSequence     →    --lieuSequence
 *     lieuSequence += 1  (effacerLieux)   →    lieuSequence -= 1
 *
 * ne casse aucune comparaison prise isolément — un numéro qui descend
 * discrimine aussi bien qu'un numéro qui monte. Il faut **les trois gestes
 * dans le même scénario** pour que le compteur repasse par une valeur déjà
 * distribuée :
 *
 *     chercherLieu('Ly')  → sequence 1, lieuSequence 1
 *     effacerLieux()      → lieuSequence 0     (au lieu de 2)
 *     chercherLieu('Lyon')→ sequence 1, lieuSequence 1   ← la même que 'Ly'
 *
 * La réponse de « Ly », arrivée après, se croit alors à jour et s'affiche à
 * la place de celle de « Lyon ». C'est exactement le défaut que le compteur
 * existe pour empêcher, et aucun test à deux gestes ne pouvait le voir.
 *
 * ## Ce que ce fichier n'établit pas
 *
 * Le message de repli — « n'a pas abouti », pour une exception qui ne serait
 * pas un `GeocodeError` — est atteint ici **par un rejet fabriqué**. Aucun
 * chemin de `chercherLieux` ne produit aujourd'hui autre chose qu'un
 * `GeocodeError` : les cinq `throw` du module en sont, et
 * `parseGeocodeResponse` aussi. Le test vérifie donc que la garde tient si
 * un jour quelque chose d'autre remonte, pas qu'elle serve aujourd'hui. Dit
 * ainsi plutôt que passé sous silence (§4bis).
 */

/** Ce que le service rendra, décidé test par test. */
let repondre: (query: string) => Promise<Lieu[]>

vi.mock('../../src/core/geocode.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/geocode.ts')>(
      '../../src/core/geocode.ts',
    )
  return {
    ...vrai,
    chercherLieux: (query: string) => repondre(query),
  }
})

const commune = (label: string): Lieu => ({
  label,
  contexte: '69, Rhône',
  center: [4.83, 45.76],
})

/** Une promesse dont le test décide quand — et comment — elle aboutit. */
function differee<T>() {
  let tenir: (v: T) => void = () => undefined
  let rompre: (e: unknown) => void = () => undefined
  const promesse = new Promise<T>((resolve, reject) => {
    tenir = resolve
    rompre = reject
  })
  // Un rejet posé avant d'être attendu produit sinon un « unhandled
  // rejection » qui fait échouer la suite pour une raison sans rapport.
  promesse.catch(() => undefined)
  return { promesse, tenir, rompre }
}

/** Le strict nécessaire pour appeler la tranche, et rien de plus. */
function tranche() {
  const etat = {
    lieux: [] as Lieu[],
    lieuError: null as string | null,
    lieuxVides: false,
    lieuxLoading: false,
  }
  const poser = (partiel: unknown) => {
    const bout =
      typeof partiel === 'function'
        ? (partiel as (e: unknown) => object)(etat)
        : partiel
    Object.assign(etat, bout)
  }
  const deps = {
    set: poser,
    etat: () => etat,
    baseOuverte: () => Promise.resolve(null),
    persistLastZone: () => Promise.resolve(),
    recompute: () => Promise.resolve(),
    setItineraries: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone
  /*
    Les deux tranches ensemble sous un seul nom : la recherche a quitté la
    zone (#454), mais `loadAutour` la referme toujours — et c'est justement
    cet accord que ces tests éprouvent.
  */
  const recherche = trancheRecherche({ set: poser })
  const actions = {
    ...trancheZone({ ...deps, oublierLesLieux: recherche.effacerLieux }),
    ...recherche,
  }
  return { actions, etat }
}

describe('recherche de lieu : le champ vide', () => {
  beforeEach(() => {
    repondre = () => Promise.resolve([])
  })

  it('un champ vidé n’interroge pas le service', async () => {
    const interroge: string[] = []
    repondre = (q) => {
      interroge.push(q)
      return Promise.resolve([commune('Lyon')])
    }
    const { actions, etat } = tranche()
    etat.lieux = [commune('Lyon')]
    etat.lieuError = 'une erreur d’avant'
    etat.lieuxVides = true

    await actions.chercherLieu('')

    expect(
      interroge,
      'un champ vidé partait interroger le service pour une chaîne vide.',
    ).toEqual([])
    expect(etat.lieux).toEqual([])
    expect(etat.lieuError).toBeNull()
    expect(etat.lieuxVides).toBe(false)
  })

  it('n’allume pas le témoin de chargement pour un champ vide', async () => {
    const { actions, etat } = tranche()
    await actions.chercherLieu('')
    expect(etat.lieuxLoading).toBe(false)
  })

  it('un champ d’espaces est un champ vide', async () => {
    // Mutant tué : `query.trim()` → `query`. Sans la coupe, une suite
    // d'espaces n'est pas la chaîne vide : la garde la laisse passer et une
    // requête part.
    const interroge: string[] = []
    repondre = (q) => {
      interroge.push(q)
      return Promise.resolve([])
    }
    const { actions } = tranche()
    await actions.chercherLieu('   ')
    expect(
      interroge,
      'trois espaces partaient interroger le service.',
    ).toEqual([])
  })
})

describe('recherche de lieu : le témoin de chargement', () => {
  it('s’allume pendant l’attente et s’éteint après', async () => {
    const { promesse, tenir } = differee<Lieu[]>()
    repondre = () => promesse
    const { actions, etat } = tranche()

    const enCours = actions.chercherLieu('Lyon')
    expect(
      etat.lieuxLoading,
      'rien ne disait à l’écran qu’une recherche était partie.',
    ).toBe(true)

    tenir([commune('Lyon')])
    await enCours
    expect(
      etat.lieuxLoading,
      'le champ de recherche tournait indéfiniment : le `finally` ne rendait' +
        ' pas la main.',
    ).toBe(false)
    expect(etat.lieux.map((l) => l.label)).toEqual(['Lyon'])
  })

  it('s’éteint aussi quand la recherche échoue', async () => {
    repondre = () => Promise.reject(new GeocodeError('service en panne'))
    const { actions, etat } = tranche()
    await actions.chercherLieu('Lyon')
    expect(etat.lieuxLoading).toBe(false)
    expect(etat.lieuError).toBe('service en panne')
  })

  it('une frappe abandonnée n’éteint pas le témoin de la suivante', async () => {
    // Mutant tué : `sequence === lieuSequence` → `!==`, et → `true`.
    //
    // La réponse de « Ly » arrive alors que « Lyon » court encore. Elle ne
    // doit rien éteindre : sinon le champ se dit prêt pendant qu'il attend.
    const premiere = differee<Lieu[]>()
    const seconde = differee<Lieu[]>()
    const files = [premiere, seconde]
    repondre = () => files.shift()!.promesse

    const { actions, etat } = tranche()
    const a = actions.chercherLieu('Ly')
    const b = actions.chercherLieu('Lyon')

    premiere.tenir([commune('Ly-sur-rien')])
    await a

    expect(
      etat.lieuxLoading,
      'la réponse d’une frappe abandonnée éteignait le témoin alors que la' +
        ' recherche en cours attendait toujours.',
    ).toBe(true)

    seconde.tenir([commune('Lyon')])
    await b
    expect(etat.lieuxLoading).toBe(false)
  })
})

describe('recherche de lieu : ce qu’une réponse périmée n’a pas le droit de dire', () => {
  it('une frappe abandonnée qui échoue ne pose pas son erreur', async () => {
    // Mutant tué : la garde du `catch`, `sequence !== lieuSequence` → `false`.
    const premiere = differee<Lieu[]>()
    const seconde = differee<Lieu[]>()
    const files = [premiere, seconde]
    repondre = () => files.shift()!.promesse

    const { actions, etat } = tranche()
    const a = actions.chercherLieu('Ly')
    const b = actions.chercherLieu('Lyon')

    seconde.tenir([commune('Lyon')])
    await b
    premiere.rompre(new GeocodeError('service en panne'))
    await a

    expect(
      etat.lieuError,
      'l’échec d’une frappe abandonnée effaçait le résultat de la suivante et' +
        ' affichait une panne par-dessus.',
    ).toBeNull()
    expect(etat.lieux.map((l) => l.label)).toEqual(['Lyon'])
  })

  it('une erreur retire les résultats précédents', async () => {
    // Mutant tué : `lieux: []` → une liste non vide. Sans le vidage, une
    // panne s'affiche au-dessus des communes de la recherche d'avant, qui
    // restent cliquables.
    repondre = () => Promise.resolve([commune('Lyon')])
    const { actions, etat } = tranche()
    await actions.chercherLieu('Lyon')
    expect(etat.lieux).toHaveLength(1)

    repondre = () => Promise.reject(new GeocodeError('service en panne'))
    await actions.chercherLieu('Lyonn')

    expect(
      etat.lieux,
      'les communes de la recherche précédente restaient affichées sous le' +
        ' message de panne.',
    ).toEqual([])
  })

  it('un échec d’une autre nature se dit quand même', async () => {
    // Voir l'en-tête : aucun chemin réel ne produit ceci aujourd'hui. Le
    // test tient la garde, pas un cas observé.
    repondre = () => Promise.reject(new TypeError('quelque chose d’autre'))
    const { actions, etat } = tranche()
    await actions.chercherLieu('Lyon')
    expect(etat.lieuError).toMatch(/n’a pas abouti/)
    expect(etat.lieuxLoading).toBe(false)
  })
})

describe('effacer les lieux', () => {
  it('vide la liste et le message', () => {
    const { actions, etat } = tranche()
    etat.lieux = [commune('Lyon')]
    etat.lieuError = 'une erreur'
    etat.lieuxVides = true
    etat.lieuxLoading = true

    actions.effacerLieux()

    expect(etat.lieux).toEqual([])
    expect(etat.lieuError).toBeNull()
    expect(etat.lieuxVides).toBe(false)
    expect(etat.lieuxLoading).toBe(false)
  })

  it('la réponse d’une recherche effacée ne revient pas', async () => {
    const { promesse, tenir } = differee<Lieu[]>()
    repondre = () => promesse
    const { actions, etat } = tranche()

    const enCours = actions.chercherLieu('Lyon')
    actions.effacerLieux()
    tenir([commune('Lyon')])
    await enCours

    expect(
      etat.lieux,
      'la réponse d’une recherche qu’on venait d’effacer revenait remplir la' +
        ' liste, sans que rien ne l’ait redemandée.',
    ).toEqual([])
  })

  it('effacer entre deux recherches ne rend pas la première indiscernable de la seconde', async () => {
    // LE test de ce fichier. Deux mutants tués, chacun dans un fichier de
    // pensée différent, et aucun visible à deux gestes :
    //
    //     `const sequence = ++lieuSequence`  →  `--lieuSequence`
    //     `lieuSequence += 1` (effacerLieux) →  `lieuSequence -= 1`
    //
    // Sous l'un ou l'autre, les trois gestes ci-dessous ramènent le compteur
    // sur un numéro déjà distribué : « Ly », toujours en vol, se retrouve à
    // égalité avec « Lyon » et s'affiche à sa place.
    const premiere = differee<Lieu[]>()
    const seconde = differee<Lieu[]>()
    const files = [premiere, seconde]
    repondre = () => files.shift()!.promesse

    const { actions, etat } = tranche()
    const a = actions.chercherLieu('Ly')
    actions.effacerLieux()
    const b = actions.chercherLieu('Lyon')

    premiere.tenir([commune('Ly-sur-rien')])
    await a

    expect(
      etat.lieux.map((l) => l.label),
      'la réponse de « Ly » portait le même numéro que « Lyon » et passait la' +
        ' garde : on cherchait une commune et on en voyait une autre.',
    ).toEqual([])

    seconde.tenir([commune('Lyon')])
    await b
    expect(etat.lieux.map((l) => l.label)).toEqual(['Lyon'])
  })
})
