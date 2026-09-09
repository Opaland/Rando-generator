import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { baseStyle, TRAILS_CLIQUABLES } from '../../src/components/map/style.ts'
import { NETWORK_COLORS } from '../../src/lib/networkDisplay.ts'
import { ORDRE_DES_RESEAUX } from '../../src/core/reseaux.ts'

/**
 * Ce que la carte peint pour chaque réseau (#412).
 *
 * ## Le raté, daté du 30/08
 *
 * `NETWORK_COLOR_MATCH` énumérait les réseaux **à la main** et en oubliait un :
 * `INCONNU` n'y figurait pas, et tombait donc dans le repli, `GRIS_VERT`. La
 * carte peignait `#5a6b5d` là où le badge, la légende et la barre de
 * progression peignaient `#882a5a` — ΔE 56,2, deux couleurs et non deux
 * nuances.
 *
 * `tests/unit/couleurs.test.ts` avait pourtant été écrit contre exactement ce
 * défaut, et son commentaire le décrit mot pour mot :
 *
 * > un décalage entre la couleur d'un badge et celle du tracé sur la carte ne
 * > se voit qu'au moment où l'on compare, c'est-à-dire jamais.
 *
 * Il compare `NETWORK_COLORS` aux jetons CSS. Il ne comparait rien à la table
 * de MapLibre — la seule des quatre que la carte lise réellement.
 *
 * ## Pourquoi ce test existe alors que la table est dérivée
 *
 * Le remède principal est le §4ter remède 1 : la table se **dérive**
 * maintenant de `NETWORK_COLORS`, il n'y a donc plus de liste à tenir. Ce
 * test-ci garde la dérivation elle-même — que personne ne la remplace un jour
 * par une énumération « plus lisible », qui recréerait le trou à l'identique.
 */

/** La table `match` que les couches de tracés emploient, lue dans le style. */
function tableDesReseaux(): unknown[] {
  const style = baseStyle('https://exemple/{z}/{x}/{y}', 'attribution')
  const couche = style.layers.find((c) => c.id === 'trails-base')
  const couleur = (couche as { paint?: Record<string, unknown> }).paint?.[
    'line-color'
  ]
  expect(
    Array.isArray(couleur) && couleur[0] === 'match',
    'la couche `trails-base` ne peint plus par une table `match` : ce test ne' +
      ' garde donc plus rien (#412).',
  ).toBe(true)
  return couleur as unknown[]
}

describe('la couleur d’un tracé sur la carte (#412)', () => {
  it.each(ORDRE_DES_RESEAUX)('%s est peint de sa couleur', (reseau) => {
    const table = tableDesReseaux()
    const position = table.indexOf(reseau)
    expect(
      position,
      `${reseau} n'est pas dans la table de MapLibre : la carte le peindra de` +
        ` la couleur de repli, quand le badge et la légende le peindront de la` +
        ` sienne. C'est le défaut de #412, à l'identique.`,
    ).toBeGreaterThan(0)
    expect(table[position + 1]).toBe(NETWORK_COLORS[reseau])
  })

  /**
   * Le repli existe encore, et il ne sert plus qu'à ce que MapLibre exige : une
   * valeur qui n'est **pas** un réseau. Il n'y en a pas dans les données que
   * `mapdata` produit — la propriété vient d'un `Network` — mais `match` en
   * réclame un, et le laisser vide ferait échouer la validation du style.
   */
  it('garde un repli, et il ne recouvre aucun réseau', () => {
    const table = tableDesReseaux()
    const repli = table[table.length - 1]
    const couleursDeReseau = ORDRE_DES_RESEAUX.map((r) => NETWORK_COLORS[r])
    expect(couleursDeReseau).not.toContain(repli)
  })

  /**
   * Ce que le compilateur ne vérifie plus depuis que la table est dérivée.
   *
   * `NETWORK_COLOR_MATCH` passe par une conversion large : le type de `match`
   * est un n-uplet qui exige nommément ses premières branches, et une liste
   * construite par `flatMap` ne peut pas le lui prouver. La vérification ne
   * disparaît pas pour autant — elle passe du compilateur au validateur
   * officiel du style-spec, qui est de toute façon celui que MapLibre
   * appliquera au chargement.
   */
  it('produit un style que MapLibre accepte', () => {
    const erreurs = validateStyleMin(
      baseStyle('https://exemple/{z}/{x}/{y}', 'attribution'),
    )
    expect(
      erreurs.map((e) => `${e.message} (${e.identifier})`),
      'le style ne passe plus le validateur du style-spec : la carte' +
        ' refuserait de se dessiner.',
    ).toEqual([])
  })
})

/**
 * GR et GRP se confondent en vision deutéranope (ΔE 6,9, mesuré et gardé par
 * `tests/unit/couleursDeReseau.test.ts`). La couleur ne change pas ici — la
 * choisir demanderait de revérifier son écart aux vingt autres couleurs
 * peintes (#335), un travail qui n'est pas fait. GRP se distingue donc par la
 * **forme** : même remède que le revêtement « autre » et l'itinéraire
 * déclaré, tous deux déjà lisibles sans la couleur.
 *
 * `line-dasharray` n'accepte pas d'expression pilotée par une propriété chez
 * MapLibre (contrairement à `line-color`) : le repli est donc le même que
 * pour le revêtement — deux couches filtrées, pas une table de plus.
 */
describe('GR et GRP se distinguent par la forme, pas seulement la couleur (#360)', () => {
  function couche(id: string) {
    const style = baseStyle('https://exemple/{z}/{x}/{y}', 'attribution')
    return style.layers.find((c) => c.id === id) as
      | { paint?: Record<string, unknown>; filter?: unknown }
      | undefined
  }

  it.each(['trails-base', 'trails-done'])(
    '%s a une couche soeur -grp filtrée et tiretée',
    (idBase) => {
      const base = couche(idBase)
      const grp = couche(`${idBase}-grp`)
      expect(
        grp,
        `${idBase}-grp est absent : GR et GRP ne se distinguent plus que` +
          ' par une couleur qu’un daltonien ne sépare pas (#360).',
      ).toBeDefined()
      expect(base?.filter).toEqual(['!=', ['get', 'network'], 'GRP'])
      expect(grp?.filter).toEqual(['==', ['get', 'network'], 'GRP'])
      expect(base?.paint?.['line-dasharray']).toBeUndefined()
      expect(grp?.paint?.['line-dasharray']).toBeDefined()
    },
  )

  it('le style complet reste valide pour MapLibre après la scission', () => {
    const erreurs = validateStyleMin(
      baseStyle('https://exemple/{z}/{x}/{y}', 'attribution'),
    )
    expect(
      erreurs.map((e) => `${e.message} (${e.identifier})`),
      'la scission des couches -grp ne passe plus le validateur du' +
        ' style-spec.',
    ).toEqual([])
  })

  /**
   * `useMapInteractions.ts` interroge `TRAILS_CLIQUABLES` au clic. Si cette
   * liste nomme une couche que le style ne porte plus (ou plus encore),
   * cliquer sur un tracé ne ferait plus rien, en silence — exactement le
   * défaut que ce fichier a introduit une première fois avec les couches
   * `-grp` (§4/§4ter).
   */
  it('TRAILS_CLIQUABLES ne nomme que des couches qui existent vraiment', () => {
    const style = baseStyle('https://exemple/{z}/{x}/{y}', 'attribution')
    const idsReels = new Set(style.layers.map((c) => c.id))
    for (const id of TRAILS_CLIQUABLES) {
      expect(idsReels.has(id), `${id} est cité mais absent du style`).toBe(
        true,
      )
    }
  })
})
