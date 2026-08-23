import { describe, it, expect } from 'vitest'
import indexCss from '../../src/index.css?raw'
import {
  NETWORK_COLORS,
  POSITION_COLOR,
} from '../../src/lib/networkDisplay.ts'
import {
  BLANC_BALISAGE,
  ENCRE,
  GRIS_VERT,
  PAPIER,
} from '../../src/lib/couleursPartagees.ts'
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

describe('couleur de position', () => {
  it('le point sur la carte et le bouton « où suis-je » sont du même bleu', () => {
    // MapLibre peint le point, le CSS peint le bouton : ni l'un ni l'autre ne
    // peut lire la valeur de l'autre. Un décalage entre les deux ne se
    // remarquerait qu'en les regardant côte à côte, c'est-à-dire jamais.
    const trouve = /--bleu-position:\s*([^;]+);/.exec(indexCss)
    expect(trouve?.[1]?.trim().toLowerCase()).toBe(POSITION_COLOR.toLowerCase())
  })
})

/**
 * Les couleurs de base, ajoutées le 23/08.
 *
 * Elles traînaient recopiées à la main : six `#1e2b23`, trois `#faf7f2`,
 * trois `#ffffff` dans `map/style.ts` et `summaryCard.ts`. La duplication
 * JS/CSS est inévitable — `DESIGN_SYSTEM.md` explique pourquoi — mais la
 * recopie **à l'intérieur du monde JS** ne l'était pas, et c'est elle qui
 * laissait un `#c1272d` orphelin s'installer sans que rien ne le signale.
 */
const BASES: Record<string, string> = {
  '--blanc-papier': PAPIER,
  '--vert-noir': ENCRE,
  '--gris-vert': GRIS_VERT,
  '--blanc-balisage': BLANC_BALISAGE,
}

describe('couleurs de base', () => {
  it.each(Object.entries(BASES))(
    'la variable CSS %s vaut la constante partagée',
    (variable, attendu) => {
      const trouve = new RegExp(`${variable}:\\s*([^;]+);`).exec(indexCss)
      expect(trouve?.[1]?.trim().toLowerCase()).toBe(attendu.toLowerCase())
    },
  )
})
