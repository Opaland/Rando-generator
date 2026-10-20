import { test, expect, type Page } from '@playwright/test'
import { afficherTousLesReseaux, buildGpx, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #569, point 2 — un réglage fait juste avant de quitter l'onglet
 * était perdu.
 *
 * Le curseur n'écrit qu'après 250 ms sans mouvement, pour ne pas relancer
 * l'appariement à chaque cran. En disposition compacte, « Réglages » n'est
 * même pas monté hors de son onglet : le quitter dans ces 250 ms démontait
 * le composant, et le démontage effaçait le minuteur avec la valeur.
 *
 * La mécanique est tenue par `tests/unit/reglageDiffere.test.ts` ; ici, on
 * vérifie que `Settings.tsx` s'en sert bien, dans l'application.
 */
test.use({ viewport: { width: 390, height: 844 } })

async function ouvrirLeReglageFin(page: Page): Promise<void> {
  await page.getByTestId('onglet-reglages').click()
  const reglages = page.getByTestId('settings')
  if ((await reglages.getAttribute('open')) === null) {
    await reglages.locator('summary').first().click()
  }
  await page.getByTestId('tolerance-detail').click()
}

test('un réglage fait juste avant de changer d’onglet n’est pas perdu', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('onboarding-fermer').click()
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // Une trace, pour que le réglage relance un vrai appariement.
  await page.getByTestId('onglet-sorties').click()
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })

  await ouvrirLeReglageFin(page)
  const curseur = page.getByTestId('tolerance-slider')
  await expect(curseur).not.toHaveValue('60')
  await curseur.fill('60')
  // Aussitôt, avant que les 250 ms ne courent.
  await page.getByTestId('onglet-carte').click()

  await ouvrirLeReglageFin(page)
  await expect(page.getByTestId('tolerance-slider')).toHaveValue('60')
})
