import { describe, it, expect } from 'vitest'
import { poisToGeoJSON } from '../../src/components/map/style.ts'
import { POI_COLORS } from '../../src/lib/poiDisplay.ts'
import { NETWORK_COLORS } from '../../src/lib/networkDisplay.ts'
import { baseStyle } from '../../src/components/map/style.ts'
import type { PoiKind, PointOfInterest } from '../../src/core/types.ts'

/**
 * La carte et la liste peignent la même couleur.
 *
 * Depuis le 23/08 la fiche détail affiche une pastille à côté de chaque point
 * d'intérêt : c'est ce qui rend le code couleur lisible, puisque MapLibre ne
 * dit rien de ce qu'il peint. Les deux surfaces lisent `POI_COLORS`, et ce
 * test le vérifie du côté carte — le seul où la couleur transite par une
 * propriété GeoJSON et pourrait se perdre en chemin.
 */
function poi(kind: PoiKind): PointOfInterest {
  return {
    id: `node/${kind}`,
    lon: 4.5,
    lat: 45.4,
    kind,
    name: null,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

const KINDS = Object.keys(POI_COLORS) as PoiKind[]

describe('poisToGeoJSON', () => {
  it.each(KINDS)('donne à %s la couleur de son genre', (kind) => {
    const [feature] = poisToGeoJSON([poi(kind)]).features
    expect(feature?.properties?.['color']).toBe(POI_COLORS[kind])
  })
})

describe('les repères rouges de la carte', () => {
  /**
   * Le point survolé sur le profil altimétrique valait `#c1272d` : un rouge
   * qui ne correspondait à aucun jeton, à huit unités de clarté du rouge de
   * balisage. Personne ne l'avait choisi contre lui — il avait été tapé une
   * fois. Le repère du profil et le tracé qu'il désigne sont le même objet vu
   * deux fois.
   */
  it('emploient le rouge de balisage, et pas un rouge de plus', () => {
    const style = JSON.stringify(baseStyle('https://exemple/{z}/{x}/{y}', 'a'))
    expect(style).not.toContain('#c1272d')
    const survol = baseStyle('https://exemple/{z}/{x}/{y}', 'a').layers.find(
      (couche) => couche.id === 'elevation-hover',
    )
    expect(
      (survol as { paint?: Record<string, unknown> }).paint?.['circle-color'],
    ).toBe(NETWORK_COLORS.GR)
  })
})
