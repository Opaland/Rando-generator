import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * AUDIT_UX.md, constat U2 — à exactement 800 px, l'application était amputée.
 *
 * `src/lib/ecran.ts` teste `(max-width: 800px)`, vrai à 800 : React filtrait
 * les sections par onglet. La feuille de la barre d'onglets la masquait sous
 * `(min-width: 800px)`, vrai à 800 aussi. Résultat mesuré à cette largeur :
 * sections filtrées, barre invisible, « Sorties », « Progression » et
 * « Réglages » inatteignables.
 *
 * Ce qui est gardé ici est l'invariant, pas la cause : **si les sections
 * sont filtrées par onglet, il doit exister un moyen visible d'en changer**.
 * Un futur palier posé de travers rendra ce test rouge quelle que soit la
 * façon dont il s'y prend.
 *
 * Les trois largeurs encadrent le point de rupture. Celle du milieu est celle
 * qui était cassée, et c'est une largeur réelle : un iPad en portrait, une
 * fenêtre posée à la moitié d'un écran de 1600.
 */
/**
 * Écrit en clair plutôt qu'importé de `src/lib/ecran.ts` : les tests de bout
 * en bout et l'application sont deux projets TypeScript séparés, et cette
 * frontière est voulue. La duplication est donc inévitable — et
 * `tests/unit/pointDeRupture.test.ts` vérifie que ce nombre-ci est bien
 * `LARGEUR_COMPACTE_MAX`, comme `couleurs.test.ts` le fait pour les couleurs
 * partagées entre MapLibre et le CSS (DESIGN_SYSTEM.md).
 */
const POINT_DE_RUPTURE = 800

const LARGEURS = [POINT_DE_RUPTURE - 1, POINT_DE_RUPTURE, POINT_DE_RUPTURE + 1]

for (const largeur of LARGEURS) {
  test.describe(`à ${String(largeur)} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('toutes les sections restent atteignables', async ({ page }) => {
      await mockExternalNetwork(page)
      await page.goto('/')

      // « Réglages » n'appartient pas à l'onglet « carte », qui est l'onglet
      // de départ : sa présence dit que rien n'est filtré, son absence que
      // la navigation par onglets est en service.
      const sectionsFiltrees = (await page.getByTestId('settings').count()) === 0
      const barre = page.getByTestId('barre-onglets')
      const barreUtilisable =
        (await barre.count()) > 0 && (await barre.isVisible())

      expect(
        sectionsFiltrees && !barreUtilisable,
        `à ${String(largeur)} px : sections filtrées par onglet sans barre visible pour en changer`,
      ).toBe(false)

      // Et on le prouve par le geste, pas seulement par la présence : on va
      // vraiment chercher les réglages.
      if (sectionsFiltrees) {
        await page.getByTestId('onglet-reglages').click()
      }
      await expect(page.getByTestId('settings')).toHaveCount(1)
    })
  })
}
