import { describe, it, expect } from 'vitest'
import { nombresDuTexte, nombresInconnus } from '../../src/core/nombresDuTexte.ts'

/**
 * Issue #673 — le texte qu'écrit Claude ne peut porter que des nombres que le
 * code a calculés (CLAUDE.md §2). Ce module lit les nombres d'un texte
 * français et dit lesquels ne sont pas dans les faits envoyés. Principe repris
 * de l'analyse mensuelle de Netatmo (`unknown_numbers`).
 */
describe('nombresDuTexte', () => {
  it('lit les écritures françaises : virgule décimale, espaces de milliers', () => {
    expect(nombresDuTexte('412,4 km et 1 234 m, puis 2\u202f150 m et 3\u00a0000 m')).toEqual([
      412.4, 1234, 2150, 3000,
    ])
  })

  it('lit un nombre écrit en toutes lettres, qui contournerait sinon la vérification', () => {
    expect(nombresDuTexte('Trois sorties, puis vingt kilomètres')).toEqual([3, 20])
  })

  it('ne prend pas « un » ou « une » pour un nombre : ce sont d’abord des articles', () => {
    expect(nombresDuTexte('Une belle année, un mois calme')).toEqual([])
  })

  it('ne lit pas un chiffre collé derrière un mot (GR7) comme une mesure', () => {
    expect(nombresDuTexte('le GR7 balisé')).toEqual([])
  })

  /*
    Relecture adverse du 11/11 (#673) : « trente et une sorties » passait
    pour 30, « soixante-douze » pour 60 et 12, et un rang (« 3e mois ») ou
    une fraction (« la moitié ») n'étaient pas lus du tout. Un rang ou une
    fraction sont des nombres que le modèle aurait calculés.
  */
  it('lit un composé en lettres comme un seul nombre', () => {
    expect(nombresDuTexte('trente et une sorties')).toEqual([31])
    expect(nombresDuTexte('soixante-douze sorties')).toEqual([72])
    expect(nombresDuTexte('vingt-deux fois')).toEqual([22])
    expect(nombresDuTexte('quatre-vingt-dix km')).toEqual([90])
    expect(nombresDuTexte('deux cent cinquante mètres')).toEqual([250])
    expect(nombresDuTexte('zéro sortie')).toEqual([0])
  })

  it('lit les rangs et les fractions', () => {
    expect(nombresDuTexte('votre 3e mois, le 1er')).toEqual([3, 1])
    expect(nombresDuTexte('la moitié, un tiers, le double')).toEqual([0.5, 1 / 3, 2])
  })

  it('lit le signe moins', () => {
    expect(nombresDuTexte('−12 % et -3')).toEqual([-12, -3])
  })
})

describe('nombresInconnus', () => {
  const faits = {
    annee: 2026,
    sorties: 38,
    km: 412.37,
    deniveleM: 12480,
    itineraires: [{ nom: 'GR 7', pct: 61 }],
  }

  it('accepte les nombres des faits et leurs arrondis', () => {
    expect(
      nombresInconnus('En 2026, 38 sorties, 412,4 km (412 km), 12 480 m, 61 % du GR 7.', faits),
    ).toEqual([])
  })

  it('rejette un nombre qui n’est pas dans les faits', () => {
    expect(nombresInconnus('En 2026, 39 sorties et 500 km.', faits)).toEqual([39, 500])
  })

  it('rejette un nombre en lettres qui n’est pas dans les faits', () => {
    expect(nombresInconnus('Vous êtes sorti douze fois.', faits)).toEqual([12])
  })

  it('ne tire aucun nombre des clés des faits, seulement de leurs valeurs', () => {
    // Une clé « top3 » ne doit pas autoriser 3.
    expect(nombresInconnus('3 sorties', { top3: [] })).toEqual([3])
  })

  it('n’accepte un pourcentage que s’il est un pourcentage des faits', () => {
    // 12 sorties ne permettent pas d'écrire « 12 % » : le modèle l'aurait
    // calculé, et l'égalité serait un hasard.
    expect(nombresInconnus('12 sorties, en hausse de 12 %', { sorties: 12 })).toEqual([12])
    expect(nombresInconnus('61 % du GR 7', { itineraires: [{ nom: 'GR 7', pct: 61 }] })).toEqual([])
  })

  it('rejette un composé en lettres dont seules les parties sont des faits', () => {
    expect(nombresInconnus('soixante-douze sorties', { sorties: 60, moisActifs: 12 })).toEqual([72])
  })

  it('ignore les booléens des faits', () => {
    expect(nombresInconnus('1 sortie', { complet: true })).toEqual([1])
  })
})
