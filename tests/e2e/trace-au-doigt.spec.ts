import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  clickOnMap,
  estAlEcran,
  fermerLeGuide,
  hasMap,
  mockElevation,
  mockExternalNetwork,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Sous le point de rupture, le tracé s'enregistre au doigt (#546).
 *
 * Mesuré le 18/10, zone Pilat, « Tracer sur la carte » ouvert : à 390 × 844
 * la feuille du panneau, même repliée, peignait par-dessus le champ du nom et
 * « Enregistrer » (0 point sur 80 au centre du bouton) ; à 800 × 900, la
 * feuille à mi-course recouvrait le panneau de tracé tout entier. Le tracé
 * pouvait se dessiner, pas s'enregistrer.
 *
 * Décidé le 19/10 avec Cédric : tant qu'on trace, la feuille se replie et le
 * panneau de tracé se pose au-dessus d'elle — la carte reste à qui la dessine.
 *
 * Le grand écran est gardé par `trace-ne-cache-rien.spec.ts` (#544).
 */
for (const largeur of [
  { nom: 'téléphone', width: 390, height: 844 },
  { nom: 'point de rupture', width: 800, height: 900 },
]) {
  test.describe(`${largeur.nom} (${String(largeur.width)} px, au doigt)`, () => {
    test.use({
      viewport: { width: largeur.width, height: largeur.height },
      hasTouch: true,
    })

    test('le tracé ouvert, le nom et « Enregistrer » sont peints, et l’enregistrement aboutit', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await mockElevation(page)
      await page.goto('/')
      test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

      await fermerLeGuide(page)
      await ouvrirOnglet(page, 'carte')
      await page.getByTestId('zone-pilat').click()
      await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
        timeout: 15_000,
      })
      await afficherTousLesReseaux(page)

      await ouvrirOnglet(page, 'sorties')
      await page.getByTestId('custom-draw').click()
      await expect(page.getByTestId('route-drawer')).toBeVisible()

      // Ce qui est peint, pas ce qui existe (§1bis) — et en boucle, la
      // feuille met 0,2 s à changer de hauteur.
      await expect
        .poll(() => estAlEcran(page, 'route-drawer-save'), {
          message: '« Enregistrer » est recouvert',
        })
        .toBe(true)
      await expect
        .poll(() => estAlEcran(page, 'route-drawer-name'), {
          message: 'le champ du nom est recouvert',
        })
        .toBe(true)

      /*
        Le panneau occupe le bas de l'écran : les deux points visés tombaient
        dessous, et le toucher allait au panneau. Quelqu'un déplacerait la
        carte ; le test la cadre au-dessus du panneau, sans animation.
      */
      await page.evaluate(() => {
        const panneau = document
          .querySelector('[data-testid="route-drawer"]')
          ?.getBoundingClientRect()
        const map = (
          window as unknown as {
            __sentiersMap?: {
              fitBounds: (b: [[number, number], [number, number]], o: object) => void
            }
          }
        ).__sentiersMap
        if (!panneau || !map) return
        map.fitBounds(
          [
            [4.49, 45.395],
            [4.54, 45.405],
          ],
          {
            padding: { top: 20, left: 20, right: 20, bottom: window.innerHeight - panneau.top + 20 },
            duration: 0,
          },
        )
      })
      await clickOnMap(page, 4.5, 45.4)
      await clickOnMap(page, 4.53, 45.4)
      await expect(page.getByTestId('route-drawer-stats')).toContainText('2 étapes')

      await page.getByTestId('route-drawer-name').fill('Tracée au doigt')
      await page.getByTestId('route-drawer-save').tap()
      await expect(page.getByTestId('route-drawer')).toHaveCount(0)
      await ouvrirOnglet(page, 'sorties')
      await expect(page.getByTestId('custom-list')).toContainText('Tracée au doigt')
    })
  })
}
