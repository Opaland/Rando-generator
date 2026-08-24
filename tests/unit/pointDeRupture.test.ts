import { describe, it, expect } from 'vitest'
import { LARGEUR_COMPACTE_MAX } from '../../src/lib/ecran.ts'
import indexCssBrut from '../../src/index.css?raw'
import appCssBrut from '../../src/App.module.css?raw'
import specPointDeRupture from '../e2e/point-de-rupture.spec.ts?raw'

/**
 * Le point de rupture est écrit en JavaScript **et** en CSS, et il ne peut
 * pas en être autrement : une média-requête ne lit pas une constante JS, et
 * React doit connaître la largeur parce que c'est lui qui décide quelles
 * sections sont rendues (src/lib/ecran.ts).
 *
 * `DESIGN_SYSTEM.md` tolère cette duplication à une condition : qu'un test
 * compare les deux mondes et échoue quand ils divergent — c'est ce que fait
 * déjà `couleurs.test.ts` pour les couleurs de MapLibre. Ce test-ci fait la
 * même chose pour la largeur, parce que la divergence a coûté cher :
 *
 * `ecran.ts` testait `(max-width: 800px)` — vrai à 800 — et la feuille de la
 * barre d'onglets masquait celle-ci sous `(min-width: 800px)` — vrai à 800
 * aussi. À cette largeur exacte, les sections étaient filtrées par onglet et
 * la barre qui permet d'en changer était invisible : « Sorties »,
 * « Progression » et « Réglages » devenaient inatteignables (AUDIT_UX.md,
 * constat U2).
 */

const feuillesComposants = import.meta.glob('../../src/components/*.module.css', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const TOUTES: [string, string][] = [
  ['src/index.css', indexCssBrut],
  ['src/App.module.css', appCssBrut],
  ...Object.entries(feuillesComposants).map(
    ([chemin, contenu]) => [chemin.replace('../../', ''), contenu] as [string, string],
  ),
]

/**
 * Les commentaires sont retirés avant tout examen — `jetons.test.ts` a payé
 * cette leçon, où « issue #169 » se lisait comme une couleur écrite en dur.
 * Ici, un commentaire qui *cite* la règle supprimée se lisait comme la règle
 * elle-même.
 */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Toutes les bornes en pixels employées dans une média-requête de largeur. */
function bornes(cssBrut: string): { sens: 'max' | 'min'; valeur: number }[] {
  const css = sansCommentaires(cssBrut)
  const trouvees: { sens: 'max' | 'min'; valeur: number }[] = []
  const motif = /@media[^{]*?\((max|min)-width:\s*(\d+(?:\.\d+)?)px\)/g
  let m: RegExpExecArray | null
  while ((m = motif.exec(css)) !== null) {
    trouvees.push({ sens: m[1] as 'max' | 'min', valeur: Number(m[2]) })
  }
  return trouvees
}

describe('le point de rupture, en JS et en CSS', () => {
  it('n’est écrit qu’à une seule valeur en `max-width`', () => {
    const valeurs = new Set<number>()
    for (const [, css] of TOUTES) {
      for (const borne of bornes(css)) {
        // Les paliers intermédiaires (1100 px) ne sont pas le point de
        // rupture : seules les bornes proches de lui sont comparées.
        if (borne.sens === 'max' && Math.abs(borne.valeur - LARGEUR_COMPACTE_MAX) <= 1) {
          valeurs.add(borne.valeur)
        }
      }
    }
    expect([...valeurs]).toEqual([LARGEUR_COMPACTE_MAX])
  })

  /**
   * L'invariant qui a manqué. `(max-width: N)` et `(min-width: N)` sont vrais
   * tous les deux à N : deux règles qui se croient complémentaires se
   * recouvrent sur un pixel. Le complément de `max-width: N` est
   * `min-width: N + 1`, jamais `min-width: N`.
   */
  it('ne pose aucune borne `min-width` sur le point de rupture lui-même', () => {
    const fautives: string[] = []
    for (const [nom, css] of TOUTES) {
      for (const borne of bornes(css)) {
        if (borne.sens === 'min' && borne.valeur === LARGEUR_COMPACTE_MAX) {
          fautives.push(`${nom} : min-width ${String(borne.valeur)}px`)
        }
      }
    }
    expect(fautives).toEqual([])
  })
})

/**
 * Aucune surface ne se croit sur grand écran avant que l'application n'y soit.
 *
 * Ce test remplace un commentaire qui disait le contraire, et qui avait
 * cessé d'être vrai. Il tolérait les `min-width: 640px` des surcouches
 * flottantes — fiche détail, carte-résumé, tiroir de tracé, bouton de
 * position — au motif qu'un palier intermédiaire dit seulement « à partir de
 * 640 px on peut se permettre ceci ».
 *
 * C'était faux, et la mesure l'a dit le 24/08. Ces quatre paliers ne
 * décidaient pas d'un détail : ils décidaient de **l'ancrage**. Entre 640 et
 * 800 px, les surcouches se posaient en petits panneaux flottants d'écran
 * large, pendant que React servait encore la feuille glissante et la barre
 * d'onglets. À 800 px pile, la poignée était peinte par-dessus la fiche
 * détail — quatre points du quadrillage, `elementFromPoint` à l'appui.
 *
 * C'est la même famille que le constat U2 : deux seuils qui décident de la
 * même chose et ne sont pas d'accord. La règle est donc mécanique et sans
 * exception — **une média-requête `min-width` vaut au moins un pixel de plus
 * que le point de rupture** — plutôt qu'une liste de cas tolérés, qui
 * demanderait à quelqu'un de se souvenir pourquoi.
 *
 * Un palier au-dessus du point de rupture reste permis : `App.module.css`
 * en a un à 801/1100 pour la colonne intermédiaire, et il ne contredit rien.
 */
describe('les paliers des surcouches', () => {
  it('ne traitent jamais comme « large » une largeur que l’application dit compacte', () => {
    const fautives: string[] = []
    for (const [nom, css] of TOUTES) {
      for (const borne of bornes(css)) {
        if (borne.sens === 'min' && borne.valeur <= LARGEUR_COMPACTE_MAX) {
          fautives.push(`${nom} : min-width ${String(borne.valeur)}px`)
        }
      }
    }
    expect(
      fautives,
      `paliers sous le point de rupture : ${fautives.join(', ')}`,
    ).toEqual([])
  })
})

/**
 * La règle structurelle, plus forte que la précédente : la présence de la
 * barre d'onglets est décidée par React, et par lui seul.
 *
 * La feuille de la barre portait un `display: none` sous média-requête,
 * présenté comme un filet — « pour le cas d'un redimensionnement pendant
 * lequel React n'aurait pas encore repeint ». C'est ce filet qui a ouvert le
 * trou : React rendait la barre à 800 px, le CSS la masquait, et les sections
 * restaient filtrées.
 *
 * Une barre visible une image de trop pendant un redimensionnement ne coûte
 * rien. Une barre masquée pendant que les sections sont filtrées coûte
 * l'accès à trois quarts de l'application.
 */
describe('la barre d’onglets', () => {
  const feuille = Object.entries(feuillesComposants).find(([chemin]) =>
    chemin.endsWith('BarreOnglets.module.css'),
  )

  it('a bien sa feuille de style', () => {
    expect(feuille).toBeDefined()
  })

  it('n’est masquée par aucune média-requête', () => {
    const css = sansCommentaires(feuille?.[1] ?? '')
    const sousMediaRequete = css
      .split('@media')
      .slice(1)
      .join('@media')
    expect(sousMediaRequete).not.toMatch(/display:\s*none/)
  })
})

/**
 * Le troisième monde : la suite de bout en bout, qui vit dans un autre projet
 * TypeScript et ne peut donc pas importer la constante. Elle écrit la largeur
 * en clair ; ce test garde l'accord, faute de quoi le test de frontière
 * mesurerait une frontière qui n'existe plus.
 */
describe('la largeur écrite dans la suite de bout en bout', () => {
  it('est bien le point de rupture', () => {
    const declaration = /const POINT_DE_RUPTURE = (\d+)/.exec(
      sansCommentaires(specPointDeRupture),
    )
    expect(declaration).not.toBeNull()
    expect(Number(declaration?.[1])).toBe(LARGEUR_COMPACTE_MAX)
  })
})
