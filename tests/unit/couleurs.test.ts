import { describe, it, expect } from 'vitest'
import indexCss from '../../src/index.css?raw'
import { NETWORK_COLORS } from '../../src/lib/networkDisplay.ts'
import type { Network } from '../../src/core/types.ts'

/**
 * Les couleurs de balisage existent forcément en deux endroits : MapLibre ne
 * lit pas les propriétés personnalisées CSS, et les badges de la barre
 * latérale ne peuvent pas lire une constante JavaScript depuis une feuille
 * de style. Ce test empêche les deux listes de diverger en silence — un
 * décalage entre la couleur d'un badge et celle du tracé sur la carte ne se
 * voit qu'au moment où l'on compare, c'est-à-dire jamais.
 */
const VARIABLES: Record<Network, string> = {
  GR: '--rouge-balisage',
  GRP: '--orange-grp',
  PR: '--jaune-pr',
  LOCAL: '--bleu-local',
  PERSO: '--vert-noir',
}

describe('couleurs de réseau', () => {
  it('couvre tous les réseaux', () => {
    expect(Object.keys(VARIABLES).sort()).toEqual(
      Object.keys(NETWORK_COLORS).sort(),
    )
  })

  it.each(Object.entries(VARIABLES))(
    'la constante %s vaut la variable CSS %s',
    (network, variable) => {
      const attendu = NETWORK_COLORS[network as Network].toLowerCase()
      const trouve = new RegExp(`${variable}:\\s*([^;]+);`).exec(indexCss)
      expect(trouve?.[1]?.trim().toLowerCase()).toBe(attendu)
    },
  )
})
