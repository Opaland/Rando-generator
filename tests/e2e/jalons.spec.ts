import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Jalons et itinéraires bouclés. Fixture Pilat : le GPX décalé de 15 m au
 * nord couvre entièrement le GR 7 (100 %) et laisse les deux autres à 0 %.
 */
test('un itinéraire bouclé est signalé, les autres annoncent leur prochain jalon', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  // Sans trace, rien n'est bouclé et le premier jalon est annoncé.
  await expect(page.getByTestId('global-completed')).toHaveCount(0)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await expect(page.getByTestId('itinerary-card-milestone')).toContainText(
    /pour atteindre 25 %/,
  )

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  // Le GR 7 est bouclé : le tableau de bord le compte, la fiche le dit sans
  // prétendre à 100 % de couverture.
  await expect(page.getByTestId('global-completed')).toContainText(
    '1 itinéraire bouclé',
  )
  await expect(page.getByTestId('itinerary-card-milestone')).toContainText(
    /bouclé \(au moins 95 % parcourus\)/,
  )
})
