import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Issue #169 — `navigator.storage.persist()` n'était appelé nulle part.
 *
 * Ce que ces tests vérifient : que la demande part au bon moment (après le
 * premier import, jamais au chargement), et que l'état affiché n'invente
 * rien quand le navigateur ne répond pas.
 */

test('la persistance n’est pas demandée au chargement, mais au premier import', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.addInitScript(() => {
    const fenetre = window as unknown as { __persistAppels: number }
    fenetre.__persistAppels = 0
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: () => {
        fenetre.__persistAppels += 1
        return Promise.resolve(true)
      },
    })
    Object.defineProperty(navigator.storage, 'persisted', {
      configurable: true,
      value: () => Promise.resolve(false),
    })
  })
  await page.goto('/')
  await expect(page.getByTestId('onboarding')).toBeVisible()

  // Rien n'a été déposé : la demander ici la ferait refuser, et l'occasion
  // serait perdue.
  expect(
    await page.evaluate(
      () => (window as unknown as { __persistAppels: number }).__persistAppels,
    ),
  ).toBe(0)

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx')

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __persistAppels: number }).__persistAppels,
      ),
    )
    .toBe(1)
})

test('la sauvegarde dit ce que le stockage occupe et s’il tient', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', {
      configurable: true,
      value: () => Promise.resolve(true),
    })
    Object.defineProperty(navigator.storage, 'estimate', {
      configurable: true,
      value: () => Promise.resolve({ usage: 3_500_000, quota: 100_000_000 }),
    })
  })
  await page.goto('/')

  await page.getByTestId('backup').locator('summary').click()
  const etat = page.getByTestId('stockage-etat')
  await expect(etat).toContainText('Mo')
  await expect(etat).toContainText('s’est engagé')
})

test('un navigateur muet ne se voit pas attribuer zéro octet', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.addInitScript(() => {
    // Le cas d'un navigateur sans l'API : il n'a pas zéro octet, il a un
    // chiffre qu'on n'a pas.
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto('/')

  const etat = page.getByTestId('stockage-etat')
  await expect(etat).toContainText('ne dit pas combien de place')
  await expect(etat).not.toContainText('0 o')
})
