import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

test('un bandeau explique ce qui reste possible sans connexion', async ({
  page,
  context,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await expect(page.getByTestId('offline-banner')).toHaveCount(0)

  await context.setOffline(true)
  const banner = page.getByTestId('offline-banner')
  await expect(banner).toBeVisible()
  // Le message doit distinguer ce qui marche de ce qui ne marche pas :
  // annoncer un « mode hors-ligne » complet serait mensonger.
  await expect(banner).toContainText(/déjà consultés/i)
  await expect(banner).toContainText(/nouvelle zone/i)

  await context.setOffline(false)
  await expect(banner).toHaveCount(0)
})

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('l’application se relance hors connexion une fois visitée', async ({
    page,
    context,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Sentiers', exact: true }),
    ).toBeVisible()

    // Le service worker doit avoir pris la main sur la page.
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    )

    // Coupure totale, puis rechargement : la coquille de l'application est
    // servie depuis le cache.
    await context.setOffline(true)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Sentiers', exact: true }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('offline-banner')).toBeVisible()
  })
})

test('le manifeste déclare des icônes exploitables pour l’installation', async ({
  request,
}) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const contenu = (await manifest.json()) as {
    icons: { src: string; sizes: string; type: string }[]
    start_url: string
    display: string
  }
  expect(contenu.display).toBe('standalone')
  const tailles = contenu.icons.map((icon) => icon.sizes)
  expect(tailles).toContain('192x192')
  expect(tailles).toContain('512x512')

  // Les fichiers déclarés existent vraiment et sont bien des PNG.
  for (const icon of contenu.icons.filter((i) => i.type === 'image/png')) {
    const reponse = await request.get(`/${icon.src}`)
    expect(reponse.ok()).toBe(true)
    const entete = (await reponse.body()).subarray(0, 8)
    expect([...entete]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }
})
