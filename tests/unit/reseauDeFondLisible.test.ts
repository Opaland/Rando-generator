import { describe, it, expect } from 'vitest'
import { baseStyle } from '../../src/components/map/style.ts'

/**
 * Le réseau de fond doit se voir à l'échelle où l'on marche.
 *
 * Démonstration du sprint 2 (#574), réseau réel, 21/10 : la zone Ain
 * chargée, MapLibre rendait quatre lignes du PDIPR autour de Culoz au
 * zoom 14 — et la capture n'en montrait **aucune**. Un trait de 1,5 px
 * gris-vert à 70 % d'opacité se fond dans les routes et les chemins du Plan
 * IGN. En vue d'ensemble, les centaines de boucles se voyaient en masse ;
 * une par une, plus rien.
 */
describe('le réseau de fond', () => {
  const couche = baseStyle('https://exemple/{z}/{x}/{y}', 'attribution').layers.find(
    (c) => c.id === 'pdipr-reseau',
  ) as { paint?: Record<string, unknown> } | undefined

  it('grossit avec le zoom, comme les tracés', () => {
    const largeur = couche?.paint?.['line-width']
    expect(Array.isArray(largeur), 'une largeur fixe : 1,5 px partout').toBe(true)
    const [, , etroite, , pleine] = largeur as [string, unknown, number, number, number]
    expect(pleine).toBeGreaterThan(etroite)
    expect(pleine).toBeGreaterThanOrEqual(3)
  })
})
