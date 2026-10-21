import { describe, it, expect, vi, afterEach } from 'vitest'
import jeuIsere from '../../public/data/pdipr-isere.json?raw'
import jeuAin from '../../public/data/pdipr-ain.json?raw'
import { jeuPdiprPour, parseReseauPdipr } from '../../src/core/pdipr.ts'
import { parseBouclesGeoJSON } from '../../src/core/boucles.ts'
import { parseGrNordGeoJSON } from '../../src/core/grNord.ts'

/**
 * Le réseau de fond PDIPR (#87) : téléchargé seulement pour la zone qui le
 * couvre, mémorisé une fois, jamais mémorisé quand il échoue, et jamais
 * appliqué pour une zone qu'on a quittée entre-temps.
 */
const UN_TRONCON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [5.7, 45.1],
            [5.71, 45.11],
          ],
        ],
      },
    },
  ],
}

async function moduleFrais() {
  vi.resetModules()
  return import('../../src/store/reseauDeFond.ts')
}

function fetchQuiRend(corps: unknown, ok = true) {
  const appel = vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(corps) } as Response),
  )
  vi.stubGlobal('fetch', appel)
  return appel
}

describe('chargerReseauDeFond', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ne télécharge rien pour une zone qu’aucun PDIPR ne couvre', async () => {
    const appel = fetchQuiRend(UN_TRONCON)
    const { chargerReseauDeFond, useReseauDeFond } = await moduleFrais()
    await chargerReseauDeFond('rhone')
    await chargerReseauDeFond(null)
    expect(useReseauDeFond.getState().reseau.features).toEqual([])
    expect(appel).not.toHaveBeenCalled()
  })

  it('télécharge le jeu de l’Isère une seule fois pour toute la session', async () => {
    const appel = fetchQuiRend(UN_TRONCON)
    const { chargerReseauDeFond, useReseauDeFond } = await moduleFrais()
    await chargerReseauDeFond('isere')
    expect(useReseauDeFond.getState().reseau.features).toHaveLength(1)
    await chargerReseauDeFond('loire')
    await chargerReseauDeFond('isere')
    expect(appel).toHaveBeenCalledTimes(1)
    expect(String(appel.mock.calls[0])).toContain('data/pdipr-isere.json')
  })

  it('efface l’Isère dès qu’on change de zone', async () => {
    fetchQuiRend(UN_TRONCON)
    const { chargerReseauDeFond, useReseauDeFond } = await moduleFrais()
    await chargerReseauDeFond('isere')
    // Lu avant que la demande pour la Loire ne se résolve : attendre la fin
    // rendrait ce test vert pour une autre raison — la réponse vide de la
    // Loire efface de toute façon l'Isère, mais trop tard pour la carte.
    const loire = chargerReseauDeFond('loire')
    expect(useReseauDeFond.getState().reseau.features).toEqual([])
    await loire
  })

  it('n’applique pas une réponse arrivée après qu’on a quitté la zone', async () => {
    let livrer: (corps: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            livrer = (corps) => {
              resolve({ ok: true, json: () => Promise.resolve(corps) } as Response)
            }
          }),
      ),
    )
    const { chargerReseauDeFond, useReseauDeFond } = await moduleFrais()
    const isere = chargerReseauDeFond('isere')
    await chargerReseauDeFond('loire')
    livrer(UN_TRONCON)
    await isere
    expect(useReseauDeFond.getState().reseau.features).toEqual([])
  })

  it('retente après un échec plutôt que de mémoriser un réseau vide', async () => {
    // Hors ligne au premier chargement : la couche serait sinon absente
    // pour toute la session.
    const appel = fetchQuiRend(null, false)
    const { chargerReseauDeFond } = await moduleFrais()
    await chargerReseauDeFond('isere')
    await chargerReseauDeFond('isere')
    expect(appel).toHaveBeenCalledTimes(2)
  })

  it('traite un fetch qui rejette comme un échec, sans lever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('hors ligne'))),
    )
    const { chargerReseauDeFond, useReseauDeFond } = await moduleFrais()
    await expect(chargerReseauDeFond('isere')).resolves.toBeUndefined()
    expect(useReseauDeFond.getState().reseau.features).toEqual([])
  })
})

describe('les trois analyseurs embarqués lisent un échec comme une donnée vide', () => {
  /*
    `memoriserJson` (src/store/sourcesLocales.ts) fait passer un échec de
    téléchargement par l'analyseur, sous la forme de `null`, et compte sur
    lui pour rendre un résultat vide sans lever (§4bis : ce « parce que » se
    vérifie).
  */
  it('boucles, GR Nord et PDIPR', () => {
    expect(parseBouclesGeoJSON(null, '2026-10-18T00:00:00Z')).toEqual([])
    expect(parseGrNordGeoJSON(null, '2026-10-18T00:00:00Z')).toEqual([])
    const emprise = { ouest: 5, est: 6, sud: 45, nord: 46 }
    expect(parseReseauPdipr(null, emprise).features).toEqual([])
  })
})

describe('le jeu embarqué de l’Isère', () => {
  /*
    Garde la donnée livrée, pas seulement le code : un export reprojeté en
    Lambert 93 ou tronqué par le script de préparation rendrait une couche
    vide sans que rien ne le dise.
  */
  const brut = JSON.parse(jeuIsere) as {
    features: { geometry: { coordinates: unknown[] } }[]
  }
  // Lu dans chaque test, pas à la collecte : voir l'en-tête de pdipr.test.ts.
  const lire = () => {
    const jeu = jeuPdiprPour('isere')
    expect(jeu, 'la zone Isère ne désigne plus de jeu PDIPR').not.toBeNull()
    return parseReseauPdipr(brut, jeu!.emprise)
  }

  it('se lit en tronçons, par milliers', () => {
    expect(lire().features.length).toBeGreaterThan(10_000)
  })

  it('n’embarque aucun tronçon que la lecture écarterait', () => {
    // Le script de préparation passe par la même règle : si le fichier
    // livré contenait des lignes hors emprise (l'amas de Grenoble-Alpes
    // Métropole au large de l'Afrique), ce seraient des octets téléchargés
    // pour rien — et le signe que le script ne filtre plus.
    const lignesLivrees = brut.features.reduce(
      (total, f) => total + f.geometry.coordinates.length,
      0,
    )
    expect(lire().features).toHaveLength(lignesLivrees)
  })
})

describe('le jeu embarqué de l’Ain', () => {
  /*
    Revue du sprint 2 (21/10) : seule l'Isère avait un test de sa donnée
    livrée. 531 lignes le 21/10 — les 480 boucles diffusables, certaines en
    plusieurs parties : « des centaines » suffit à dire que le jeu est
    arrivé entier, sans épingler un chiffre qui changera à la prochaine
    extraction.
  */
  const brut = JSON.parse(jeuAin) as {
    source?: string
    features: { geometry: { coordinates: unknown[] } }[]
  }
  const lire = () => {
    const jeu = jeuPdiprPour('ain')
    expect(jeu, 'la zone Ain ne désigne plus de jeu PDIPR').not.toBeNull()
    return parseReseauPdipr(brut, jeu!.emprise)
  }

  it('se lit en lignes, par centaines', () => {
    expect(lire().features.length).toBeGreaterThan(400)
  })

  it('n’embarque aucune ligne que la lecture écarterait', () => {
    const lignesLivrees = brut.features.reduce(
      (total, f) => total + f.geometry.coordinates.length,
      0,
    )
    expect(lire().features).toHaveLength(lignesLivrees)
  })

  it('dit d’où il vient', () => {
    expect(brut.source).toMatch(/Département de l'Ain.*Licence Ouverte 2\.0/)
  })
})
