import { describe, it, expect, beforeEach } from 'vitest'
import { creerVeilleGeo } from '../../src/store/veilleGeo.ts'

/**
 * Un seul `watchPosition` pour deux usages (issue #152).
 *
 * La carte montre où l'on est, l'enregistrement retient par où l'on est
 * passé. Deux suivis simultanés demanderaient deux fois la position haute
 * précision au système, et sur une sortie de quatre heures c'est la
 * batterie qui paie.
 *
 * Le comptage était jusqu'ici enfoui dans le store et gardé par un seul
 * test e2e. Il s'éprouve sans navigateur — voici de quoi.
 */

interface Suivi {
  succes: PositionCallback
  echec: PositionErrorCallback | null
  options: PositionOptions | undefined
}

/** Une géolocalisation qui ne fait que ce qu'on lui dit, et qui compte. */
function fausseGeolocalisation() {
  const suivis = new Map<number, Suivi>()
  let prochain = 1
  let ouverts = 0
  let fermes = 0
  const api: Geolocation = {
    watchPosition(succes, echec, options) {
      const id = prochain++
      suivis.set(id, { succes, echec: echec ?? null, options })
      ouverts += 1
      return id
    },
    clearWatch(id) {
      /*
        Un vrai navigateur ignore en silence une poignée qu'il ne connaît
        pas. Ce faux ne l'ignore pas : il **lève** (issue #464).

        Quatre mutants survivaient parce que ce faux acceptait
        `clearWatch(null)` sans broncher et comptait quand même une
        fermeture. Fermer un suivi qui n'existe pas devenait indiscernable
        de fermer le bon — donc les gardes qui l'empêchent n'étaient
        gardées par rien.

        Un faux plus tolérant que le vrai ne rend pas le test plus souple,
        il le rend aveugle (§1bis).
      */
      if (!suivis.has(id)) {
        throw new Error(
          `clearWatch(${String(id)}) : ce suivi n'a jamais été ouvert.`,
        )
      }
      suivis.delete(id)
      fermes += 1
    },
    getCurrentPosition() {
      /* inutilisé */
    },
  }
  return {
    api,
    get ouverts() {
      return ouverts
    },
    get fermes() {
      return fermes
    },
    get actifs() {
      return suivis.size
    },
    dernieresOptions: () => [...suivis.values()].at(-1)?.options,
    emettre(position: GeolocationPosition) {
      for (const suivi of suivis.values()) suivi.succes(position)
    },
    echouer(erreur: GeolocationPositionError) {
      for (const suivi of suivis.values()) suivi.echec?.(erreur)
    },
  }
}

const OPTIONS: PositionOptions = { enableHighAccuracy: true }

let geo: ReturnType<typeof fausseGeolocalisation>
let positions: GeolocationPosition[]
let erreurs: GeolocationPositionError[]

beforeEach(() => {
  geo = fausseGeolocalisation()
  positions = []
  erreurs = []
})

function veille() {
  return creerVeilleGeo({
    geolocation: () => geo.api,
    options: OPTIONS,
    surPosition: (p) => positions.push(p),
    surErreur: (e) => erreurs.push(e),
  })
}

const POSITION = {
  coords: { longitude: 4.8, latitude: 45.75, accuracy: 8 },
  timestamp: 1,
} as GeolocationPosition

const ERREUR = { code: 2, message: '' } as GeolocationPositionError

describe('un seul suivi pour deux usages', () => {
  it('n’ouvre rien tant que personne ne demande', () => {
    veille()
    expect(geo.ouverts).toBe(0)
  })

  it('ouvre un suivi au premier demandeur, et un seul pour les deux', () => {
    const v = veille()
    expect(v.demarrer('carte')).toBe(true)
    expect(geo.ouverts).toBe(1)
    expect(v.demarrer('sortie')).toBe(true)
    expect(geo.ouverts).toBe(1)
    expect(geo.actifs).toBe(1)
  })

  it('demander deux fois pour le même usage n’ouvre pas deux suivis', () => {
    const v = veille()
    v.demarrer('sortie')
    v.demarrer('sortie')
    expect(geo.ouverts).toBe(1)
  })

  /**
   * Le corollaire, et c'est lui qui compte : arrêter l'affichage de sa
   * position ne doit pas arrêter l'enregistrement d'une sortie.
   */
  it('ne ferme le suivi que quand plus personne ne le demande', () => {
    const v = veille()
    v.demarrer('carte')
    v.demarrer('sortie')

    v.arreter('carte')
    expect(geo.fermes).toBe(0)
    expect(geo.actifs).toBe(1)

    v.arreter('sortie')
    expect(geo.fermes).toBe(1)
    expect(geo.actifs).toBe(0)
  })

  it('arrêter un usage qui n’avait rien demandé ne ferme rien', () => {
    const v = veille()
    v.demarrer('sortie')
    v.arreter('carte')
    expect(geo.actifs).toBe(1)
  })

  it('rouvre un suivi après que tout le monde a lâché', () => {
    const v = veille()
    v.demarrer('carte')
    v.arreter('carte')
    v.demarrer('carte')
    expect(geo.ouverts).toBe(2)
    expect(geo.actifs).toBe(1)
  })

  it('transmet les options telles quelles', () => {
    const v = veille()
    v.demarrer('carte')
    expect(geo.dernieresOptions()).toBe(OPTIONS)
  })
})

describe('ce qui arrive par le suivi', () => {
  it('livre chaque position une seule fois, quel que soit le nombre d’usages', () => {
    const v = veille()
    v.demarrer('carte')
    v.demarrer('sortie')
    geo.emettre(POSITION)
    expect(positions).toEqual([POSITION])
  })

  /**
   * Une erreur ferme le suivi côté navigateur : le compteur doit repartir
   * de zéro, sans quoi la veille se croirait ouverte et ne rouvrirait
   * jamais. C'est le genre de dérive qu'un compteur en mémoire fait sans
   * bruit.
   */
  it('repart de zéro après une erreur, et sait rouvrir', () => {
    const v = veille()
    v.demarrer('carte')
    v.demarrer('sortie')
    geo.echouer(ERREUR)
    expect(erreurs).toEqual([ERREUR])

    expect(v.demarrer('sortie')).toBe(true)
    expect(geo.ouverts).toBe(2)
    expect(geo.actifs).toBe(1)
  })
})

describe('un navigateur sans géolocalisation', () => {
  it('refuse de démarrer, et le dit', () => {
    const v = creerVeilleGeo({
      geolocation: () => null,
      options: OPTIONS,
      surPosition: () => undefined,
      surErreur: () => undefined,
    })
    expect(v.demarrer('carte')).toBe(false)
  })

  it('supporte qu’on l’arrête quand même', () => {
    const v = creerVeilleGeo({
      geolocation: () => null,
      options: OPTIONS,
      surPosition: () => undefined,
      surErreur: () => undefined,
    })
    expect(() => {
      v.arreter('carte')
    }).not.toThrow()
  })
})

describe('ce qui ne doit jamais être fermé', () => {
  it('arrêter sans avoir démarré ne ferme aucun suivi', () => {
    /*
      Le faux lève désormais sur une poignée inconnue (#464). Sans cette
      question, la garde `identifiant !== null && api` n'était éprouvée par
      rien : muter son `&&` en `||` laissait onze tests verts, parce
      qu'aucun n'arrêtait une veille jamais ouverte.

      Un vrai navigateur ignore `clearWatch` d'une poignée inconnue, donc le
      défaut serait silencieux — c'est exactement le genre qu'un test doit
      attraper à sa place.
    */
    const v = veille()
    v.arreter('carte')
    expect(geo.fermes).toBe(0)
  })

  it('après une erreur, un seul demandeur suffit à refermer', () => {
    /*
      Ce que garde `veilleurs.clear()` dans le gestionnaire d'erreur, et ce
      n'est pas ce que son commentaire disait.

      Le commentaire affirmait : « sans cela la veille se croirait ouverte et
      ne rouvrirait jamais ». **C'est faux** — `identifiant` est remis à
      `null` juste avant, donc le `??=` de `demarrer` rouvre sans difficulté.
      Mesuré en retirant la ligne : la réouverture marche.

      Ce qui casse est l'inverse, et c'est pire : le compte des demandeurs
      garde les entrées d'avant l'erreur. Après une erreur subie à deux, si
      seule la carte redémarre, l'arrêter laisse le compte à un — et le
      suivi haute précision reste ouvert pour personne, jusqu'à la fermeture
      de l'onglet.

      Le §4bis dit ce que vaut une justification que rien ne vérifie ; en
      voici une qui était fausse dans son détail tout en désignant la bonne
      ligne.
    */
    const v = veille()
    v.demarrer('carte')
    v.demarrer('sortie')
    geo.echouer(ERREUR)

    v.demarrer('carte')
    v.arreter('carte')

    expect(geo.actifs).toBe(0)
  })
})
