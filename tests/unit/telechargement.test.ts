import { describe, it, expect } from 'vitest'
import swSource from '../../public/sw.js?raw'
import e2eSource from '../e2e/telecharger.spec.ts?raw'
import {
  MESSAGE_PRECHARGER,
  MESSAGE_PROGRES,
  estAltimetrie,
  estTuileCarte,
  ressourcesDeLaRandonnee,
} from '../../src/core/telechargement.ts'
import { IGN_TILES, OSM_TILES } from '../../src/components/map/style.ts'
import { buildElevationLineUrl } from '../../src/core/elevation.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Issue #153 — emporter une randonnée.
 *
 * Le service worker dit noir sur blanc qu'il ne cache **ni** le profil
 * altimétrique **ni** les points d'intérêt, et il a raison de le dire :
 * « un relief ou des POI périmés ne valent pas mieux qu'un message clair ».
 *
 * Cette issue ne renverse pas cette règle, elle la complète. Le cache
 * devient **volontaire** : rien n'est gardé parce qu'on l'a regardé ; les
 * choses sont gardées parce qu'on a appuyé sur « Télécharger cette
 * randonnée ». Un profil qu'on a emporté exprès n'est pas un profil périmé
 * qu'on n'a pas demandé.
 */

const TRACE: LonLat[] = [
  [4.5, 45.4],
  [4.52, 45.41],
  [4.55, 45.4],
]

describe('reconnaître ce qui vient du terrain', () => {
  it('reconnaît une tuile de la Géoplateforme et une d’OpenStreetMap', () => {
    expect(estTuileCarte(new URL(IGN_TILES.replace(/\{[zxy]\}/g, '1')))).toBe(
      true,
    )
    expect(estTuileCarte(new URL(OSM_TILES.replace(/\{[zxy]\}/g, '1')))).toBe(
      true,
    )
  })

  it('ne prend pas l’altimétrie pour une tuile', () => {
    // Le service altimétrique est sur le même hôte que les tuiles IGN, mais
    // pas sous `/wmts` : c'est précisément pour cela qu'il n'était jamais
    // caché, et le confondre avec une tuile le ferait tomber sous la limite
    // de six cents entrées prévue pour des images.
    const url = new URL(buildElevationLineUrl(TRACE))
    expect(estTuileCarte(url)).toBe(false)
    expect(estAltimetrie(url)).toBe(true)
  })

  it('ne reconnaît ni l’application elle-même ni un tiers quelconque', () => {
    for (const brut of [
      'https://opaland.github.io/Rando-generator/index.html',
      'https://overpass-api.de/api/interpreter',
      'https://exemple.test/tuile.png',
    ]) {
      const url = new URL(brut)
      expect(estTuileCarte(url)).toBe(false)
      expect(estAltimetrie(url)).toBe(false)
    }
  })
})

describe('ce qu’une randonnée emporte', () => {
  it('ne demande rien pour un itinéraire sans géométrie', () => {
    expect(
      ressourcesDeLaRandonnee([], { zooms: [14], rayonMetres: 500 }),
    ).toEqual({ tuiles: [], altimetrie: null })
  })

  it('rend les tuiles du corridor et l’adresse du profil', () => {
    const res = ressourcesDeLaRandonnee(TRACE, {
      zooms: [13, 14],
      rayonMetres: 500,
    })
    expect(res.tuiles.length).toBeGreaterThan(0)
    expect(res.altimetrie).toBe(buildElevationLineUrl(TRACE))
    for (const url of res.tuiles) {
      expect(estTuileCarte(new URL(url))).toBe(true)
    }
  })

  /**
   * Le compte annoncé avant de lancer doit décrire le téléchargement réel.
   * S'il changeait entre l'annonce et l'exécution, le chiffre montré serait
   * une estimation déguisée en promesse.
   */
  it('rend exactement la même liste à chaque appel', () => {
    const options = { zooms: [13, 14], rayonMetres: 500 }
    expect(ressourcesDeLaRandonnee(TRACE, options)).toEqual(
      ressourcesDeLaRandonnee(TRACE, options),
    )
  })

  it('ne demande jamais deux fois la même adresse', () => {
    const res = ressourcesDeLaRandonnee(TRACE, {
      zooms: [12, 13, 14],
      rayonMetres: 500,
    })
    expect(new Set(res.tuiles).size).toBe(res.tuiles.length)
  })
})

/**
 * Le service worker vit hors du bundle : il ne peut rien importer. Les noms
 * de messages y sont donc recopiés, et deux copies dérivent — c'est déjà la
 * raison d'être du test jumeau sur `CONNECTIVITY_MESSAGE`.
 */
describe('la page et le service worker parlent la même langue', () => {
  it('emploie les mêmes noms de message des trois côtés', () => {
    // Le service worker vit hors du bundle ; le fichier e2e pilote
    // l'application construite et n'importe donc rien de `src`. Trois
    // copies, un seul test pour les tenir ensemble.
    for (const source of [swSource, e2eSource]) {
      expect(source).toContain(`'${MESSAGE_PRECHARGER}'`)
      expect(source).toContain(`'${MESSAGE_PROGRES}'`)
    }
  })

  /**
   * CLAUDE.md §3 : une correction de texte se fait sur toutes les surfaces.
   * L'en-tête du service worker affirmait que le relief n'était « jamais mis
   * en cache ». Ce n'est plus vrai depuis qu'on peut l'emporter exprès, et
   * un commentaire faux au sommet d'un fichier est pire qu'absent.
   */
  it('n’affirme plus que le relief n’est jamais mis en cache', () => {
    expect(swSource).not.toContain(
      'Ces réponses ne sont volontairement\n * pas mises en cache',
    )
    expect(swSource).toMatch(/télécharg/i)
  })
})
