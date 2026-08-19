import { test, expect } from '@playwright/test'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }
import { mockTiles, MIRROR_1, MIRROR_2 } from './helpers.ts'

test('le chargement d’une zone peut être annulé sans bloquer l’UI', async ({
  page,
}) => {
  await mockTiles(page)
  const pending: { resolve: (() => void) | null } = { resolve: null }
  await page.route('**/api/interpreter', async (route) => {
    // Requête volontairement suspendue : on veut observer l'état « en cours »
    // assez longtemps pour cliquer Annuler avant qu'elle n'aboutisse.
    await new Promise<void>((resolve) => {
      pending.resolve = resolve
    })
    await route.fulfill({ json: pilatFixture })
  })
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  const loading = page.getByTestId('zone-loading')
  await expect(loading).toBeVisible()
  await expect(page.getByTestId('zone-cancel')).toBeVisible()
  // Les boutons de zone sont désactivés pendant le chargement.
  await expect(page.getByTestId('zone-loire')).toBeDisabled()

  await page.getByTestId('zone-cancel').click()
  await expect(loading).toHaveCount(0)
  await expect(page.getByTestId('zone-loire')).toBeEnabled()

  // La requête suspendue finit par aboutir en arrière-plan : elle ne doit
  // plus ressusciter l'état de chargement ni faire planter l'app.
  pending.resolve?.()
  await page.waitForTimeout(300)
  await expect(page.getByTestId('zone-loading')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Sentiers', exact: true }),
  ).toBeVisible()
})

test('la bascule de miroir affiche un message de nouvelle tentative', async ({
  page,
}) => {
  await mockTiles(page)
  await page.route(MIRROR_1, (route) => route.abort())
  await page.route(MIRROR_2, (route) => route.fulfill({ json: pilatFixture }))
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-loading')).toContainText(
    /nouvelle tentative/i,
  )
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
})
