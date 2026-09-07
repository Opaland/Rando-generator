import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { baseStyle } from '../../src/components/map/style.ts'
import { ID_TRACE_PROVISOIRE } from '../../src/core/sortieEnCours.ts'

/**
 * Le figuré de la sortie en cours sur la carte (issue #501).
 *
 * Retour de Cédric, 04/09 : « je n'ai pas pu visualiser le chemin
 * parcouru » en enregistrant. Le câblage existe (`traceProvisoire`
 * alimente la source `tracks`), mais la couche `tracks` est pensée pour
 * des traces **importées**, montrées en arrière-plan pour mémoire : trait
 * fin (1,5 px), tireté, à 65 % d'opacité, couleur neutre (`ENCRE`).
 *
 * La sortie en cours n'est pas une trace de contexte, c'est **la seule
 * chose qu'on regarde en marchant** — juste sous le point bleu de position
 * (`user-position`, rayon 7, plein, sur sa propre couche « au-dessus de
 * tout le reste »). Un trait quatre fois plus fin et à moitié transparent
 * juste en dessous d'un point aussi appuyé est le genre d'écart qu'une
 * revue de code ne voit pas — il faut les deux styles sous les yeux en
 * même temps pour le remarquer.
 *
 * Ce test compare les deux déclarations plutôt que de juger une couleur au
 * pixel (CLAUDE.md §6sexies : la largeur et l'opacité sont mesurables,
 * « est-ce assez visible » ne l'est pas).
 */

function couche(id: string) {
  const style = baseStyle('https://exemple/{z}/{x}/{y}', 'attribution')
  const trouvee = style.layers.find((c) => c.id === id)
  if (!trouvee) throw new Error(`couche absente du style : ${id}`)
  return trouvee as { paint?: Record<string, unknown>; filter?: unknown }
}

describe('la trace de la sortie en cours', () => {
  it('a sa propre couche, distincte de celle des traces importées', () => {
    const enCours = couche('tracks-en-cours')
    expect(enCours.filter).toEqual([
      '==',
      ['get', 'trackId'],
      ID_TRACE_PROVISOIRE,
    ])
  })

  it('la couche des traces importées exclut désormais la sortie en cours', () => {
    const importees = couche('tracks')
    expect(importees.filter).toEqual([
      '!=',
      ['get', 'trackId'],
      ID_TRACE_PROVISOIRE,
    ])
  })

  it('est au moins aussi appuyée qu\'un itinéraire parcouru — pas un simple repère de fond', () => {
    const enCours = couche('tracks-en-cours')
    const importees = couche('tracks')
    const largeurEnCours = enCours.paint?.['line-width']
    const largeurImportee = importees.paint?.['line-width']
    expect(typeof largeurEnCours).toBe('number')
    expect(largeurEnCours as number).toBeGreaterThan(largeurImportee as number)

    // Un trait pointillé convient à une trace de contexte ; pas à la seule
    // ligne qu'on suit en marchant, gantée, au soleil (persona Sylvie).
    expect(enCours.paint?.['line-dasharray']).toBeUndefined()

    const opaciteEnCours = enCours.paint?.['line-opacity'] as number
    const opaciteImportee = importees.paint?.['line-opacity'] as number
    expect(opaciteEnCours).toBeGreaterThanOrEqual(opaciteImportee)
  })

  it('produit toujours un style que MapLibre accepte', () => {
    const erreurs = validateStyleMin(
      baseStyle('https://exemple/{z}/{x}/{y}', 'attribution'),
    )
    expect(erreurs.map((e) => `${e.message} (${e.identifier})`)).toEqual([])
  })
})
