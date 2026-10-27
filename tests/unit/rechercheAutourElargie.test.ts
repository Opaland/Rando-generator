// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }
import { OverpassError } from '../../src/core/overpass.ts'
import type { DependancesZone } from '../../src/store/trancheZone.ts'

/**
 * Issue #591 — une recherche « autour » vide s'élargit à 25 km, une fois, et
 * le dit. Le cœur (`rayonSuivant`, la clé, le libellé) est testé dans
 * `rechercheAutour.test.ts` ; ici, que la tranche s'en sert vraiment.
 *
 * Le réseau est simulé par le rayon de la requête : vide à 12 km, le Pilat
 * de la fixture à 25 km — la forme de ce qui a été mesuré autour de Nouméa.
 */
const PILAT: unknown = pilat

const reseau = {
  requetes: [] as string[],
  /** Ce que rend chaque rayon ; une erreur pour simuler la panne. */
  repondre: (requete: string): Promise<unknown> =>
    Promise.resolve(requete.includes('around:25000') ? PILAT : { elements: [] }),
}

vi.mock('../../src/core/overpass.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/overpass.ts')>(
      '../../src/core/overpass.ts',
    )
  return {
    ...vrai,
    fetchOverpass: (requete: string) => {
      reseau.requetes.push(requete)
      return reseau.repondre(requete)
    },
  }
})

const { trancheZone } = await import('../../src/store/trancheZone.ts')

function harnais() {
  const affichees: { cle: string; libelle: string; n: number }[] = []
  const persistees: string[] = []
  /** Chaque valeur de `zoneLoading` posée, dans l'ordre. */
  const chargements: boolean[] = []
  const etat = {
    db: null,
    zoneKey: null as string | null,
    zoneLabel: null as string | null,
    zoneError: null as string | null,
    itineraries: [],
    demonstration: false,
    zoneLoading: false,
  }
  const deps = {
    set: (partiel: unknown) => {
      const bout =
        typeof partiel === 'function' ? (partiel as (e: unknown) => object)(etat) : partiel
      Object.assign(etat, bout)
      const charge = (bout as { zoneLoading?: boolean }).zoneLoading
      if (charge !== undefined) chargements.push(charge)
    },
    etat: () => etat,
    baseOuverte: () => Promise.resolve(null),
    persistLastZone: (cle: string) => {
      persistees.push(cle)
      return Promise.resolve()
    },
    oublierLaZoneEnCache: () => Promise.resolve(),
    recompute: () => Promise.resolve(),
    setItineraries: (cle: string, libelle: string, itineraires: unknown[]) => {
      affichees.push({ cle, libelle, n: itineraires.length })
      etat.zoneKey = cle
      etat.zoneLabel = libelle
    },
    oublierLesLieux: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone
  return { actions: trancheZone(deps), affichees, etat, persistees, chargements }
}

const NOUMEA = { label: 'Nouméa', contexte: '98818', center: [166.45, -22.27] as [number, number] }

beforeEach(() => {
  reseau.requetes = []
  reseau.repondre = (requete) =>
    Promise.resolve(requete.includes('around:25000') ? PILAT : { elements: [] })
})

describe('« autour de » vide s’élargit à 25 km (#591)', () => {
  it('relance à 25 km, et l’écran dit que la recherche a été élargie', async () => {
    const { actions, affichees, etat } = harnais()
    await actions.loadAutour(NOUMEA)

    expect(reseau.requetes.map((r) => /around:(\d+)/.exec(r)?.[1])).toEqual(['12000', '25000'])
    const derniere = affichees.at(-1)
    expect(derniere?.cle).toBe('autour:166.4500,-22.2700,25000')
    expect(derniere?.libelle).toBe('Autour de Nouméa, élargi à 25 km')
    expect(derniere?.n).toBeGreaterThan(0)
    // Le message « aucun itinéraire » des 12 km ne survit pas à la relance.
    expect(etat.zoneError).toBeNull()
  })

  it('ne relance pas quand 12 km suffisent', async () => {
    reseau.repondre = () => Promise.resolve(PILAT)
    const { actions, affichees } = harnais()
    await actions.loadAutour(NOUMEA)

    expect(reseau.requetes).toHaveLength(1)
    expect(affichees.at(-1)?.libelle).toBe('Autour de Nouméa')
  })

  it('ne relance qu’une fois, même si 25 km ne trouvent rien', async () => {
    reseau.repondre = () => Promise.resolve({ elements: [] })
    const { actions, etat } = harnais()
    await actions.loadAutour(NOUMEA)

    expect(reseau.requetes).toHaveLength(2)
    expect(etat.zoneError).toMatch(/Aucun itinéraire/)
  })

  it('ne relance pas sur une panne : on ne sait pas qu’il n’y a rien', async () => {
    reseau.repondre = () => Promise.reject(new OverpassError('miroirs injoignables (test)'))
    const { actions } = harnais()
    await actions.loadAutour(NOUMEA)

    expect(reseau.requetes).toHaveLength(1)
  })

  it('« Actualiser » rejoue la recherche élargie, sous le même nom', async () => {
    const { actions, affichees, etat } = harnais()
    etat.zoneKey = 'autour:166.4500,-22.2700,25000'
    etat.zoneLabel = 'Autour de Nouméa, élargi à 25 km'
    await actions.rafraichirZone()

    // Directement à 25 km : rejouer 12 km d'abord referait la requête vide.
    expect(reseau.requetes.map((r) => /around:(\d+)/.exec(r)?.[1])).toEqual(['25000'])
    expect(affichees.at(-1)?.libelle).toBe('Autour de Nouméa, élargi à 25 km')
  })

  /*
    Trouvés par la relecture adverse du 27/10 : les 12 km vides étaient
    affichés, enregistrés comme dernière zone et annoncés « aucun
    itinéraire » **avant** que la relance soit décidée. Annuler pendant la
    seconde requête laissait alors à l'écran une zone vide sans un mot, et
    au démarrage suivant on y revenait.
  */
  it('n’affiche ni n’enregistre les 12 km vides qu’on va remplacer', async () => {
    const { actions, affichees, persistees, chargements } = harnais()
    await actions.loadAutour(NOUMEA)

    expect(affichees.map((a) => a.cle)).toEqual(['autour:166.4500,-22.2700,25000'])
    expect(persistees).toEqual(['autour:166.4500,-22.2700,25000'])
    // Le témoin ne retombe pas entre les deux requêtes : une seule attente.
    expect(chargements).toEqual([true, true, false])
  })

  it('annuler pendant la relance ne laisse pas une zone vide sans un mot', async () => {
    let relacher: (v: unknown) => void = () => undefined
    reseau.repondre = (requete) =>
      requete.includes('around:25000')
        ? new Promise((resolve) => (relacher = resolve))
        : Promise.resolve({ elements: [] })
    const { actions, affichees, persistees, etat } = harnais()
    const enCours = actions.loadAutour(NOUMEA)
    await vi.waitFor(() => {
      expect(reseau.requetes).toHaveLength(2)
    })
    actions.cancelZoneLoad()
    relacher(PILAT)
    await enCours

    expect(affichees).toEqual([])
    expect(persistees).toEqual([])
    expect(etat.zoneKey).toBeNull()
    expect(etat.zoneLoading).toBe(false)
  })
})
