import { test, expect } from '@playwright/test'
import { mockExternalNetwork, fermerLeGuide } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * AUDIT_UX.md, constat U8 — entre 800 et 1100 px, la colonne du panneau
 * était trop étroite pour son contenu.
 *
 * Mesuré à 810 px : la colonne fait 307 px, et la grille des zones y
 * imposait deux cellules de 130 px. « Rhône + Métropole de Lyon » s'y
 * cassait en trois lignes.
 *
 * Le défaut n'était pas la largeur de la colonne — ce palier existe pour que
 * la carte, qui est le produit, ne soit pas réduite à une moitié d'écran
 * (constat M1 de l'audit mobile). C'était d'y forcer deux colonnes. La
 * grille les compte maintenant elle-même.
 *
 * Ce qui est gardé est l'invariant : **le plus long libellé de zone ne
 * s'empile pas**, à aucune largeur. Une autre façon de le tenir passera ce
 * test.
 */

const LARGEURS = [390, 800, 810, 900, 1100, 1101, 1280, 1600]

/** Nombre de lignes réellement occupées par le texte d'un élément. */
async function lignes(page: Page, testId: string): Promise<number> {
  return page.getByTestId(testId).evaluate((element) => {
    const style = getComputedStyle(element)
    const hauteurLigne = Number.parseFloat(style.lineHeight)
    const marges =
      Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    const hauteur = element.getBoundingClientRect().height
    return Math.round((hauteur - marges) / hauteurLigne)
  })
}

for (const largeur of LARGEURS) {
  test.describe(`à ${String(largeur)} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('le plus long libellé de zone ne s’empile pas', async ({ page }) => {
      await mockExternalNetwork(page)
      await page.goto('/')
      await fermerLeGuide(page)

      // « Rhône + Métropole de Lyon » est le plus long des libellés de zone :
      // s'il tient, les autres tiennent.
      await expect(page.getByTestId('zone-rhone')).toBeVisible()
      const n = await lignes(page, 'zone-rhone')
      expect(
        n,
        `à ${String(largeur)} px, « Rhône + Métropole de Lyon » s’étale sur ${String(n)} lignes`,
      ).toBeLessThanOrEqual(2)
    })

    test('la grille garde deux colonnes quand elles ont de quoi tenir', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await page.goto('/')
      await fermerLeGuide(page)

      // L'autre moitié de la règle. Sans elle, un plancher trop haut
      // ramènerait tout à une colonne : les libellés tiendraient, et la
      // liste des départements deviendrait deux fois plus longue à parcourir.
      const attendu = largeur >= 1101 || largeur <= 800

      /**
       * `null` quand la mesure n'est pas encore possible, et surtout pas
       * une conclusion.
       *
       * La version d'origine repliait une boîte absente sur `?? 0` : si
       * l'une des deux zones était mesurable et l'autre pas encore, l'écart
       * valait la position de la première, donc « pas la même ligne ». Le
       * test concluait alors de rien du tout — et il l'a fait en intégration
       * continue, en échouant puis en réussissant au réessai dans le même
       * run. Rendre `null` fait attendre `expect.poll` au lieu de trancher.
       */
      const memeLigne = async (): Promise<boolean | null> => {
        const rhone = await page.getByTestId('zone-rhone').boundingBox()
        const loire = await page.getByTestId('zone-loire').boundingBox()
        if (!rhone || !loire) return null
        return Math.abs(rhone.y - loire.y) < 4
      }

      await expect
        .poll(memeLigne, {
          message: `à ${String(largeur)} px, « Rhône » et « Loire » ${attendu ? 'devraient partager' : 'ne devraient pas partager'} leur ligne`,
        })
        .toBe(attendu)
    })

    test('le champ de recherche montre son exemple en entier', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await page.goto('/')
      await fermerLeGuide(page)

      const champ = page.getByTestId('lieu-input')
      await expect(champ).toBeVisible()
      // Un champ dont l'exemple est tronqué n'explique plus ce qu'on y met.
      const tronque = await champ.evaluate((e) => {
        const input = e as HTMLInputElement
        const mesure = document.createElement('span')
        const style = getComputedStyle(input)
        mesure.style.font = style.font
        mesure.style.position = 'absolute'
        mesure.style.whiteSpace = 'pre'
        mesure.textContent = input.placeholder
        document.body.append(mesure)
        const largeurTexte = mesure.getBoundingClientRect().width
        mesure.remove()
        const dispo =
          input.getBoundingClientRect().width -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight)
        return largeurTexte > dispo
      })
      expect(tronque, `à ${String(largeur)} px, l’exemple du champ est coupé`).toBe(false)
    })
  })
}
