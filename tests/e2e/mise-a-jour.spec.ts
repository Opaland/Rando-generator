import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Le bandeau « nouvelle version disponible » (sprint 1, signalé en usage
 * réel le 29/09 : la PWA ouverte depuis son icône peut tourner des semaines
 * sur une version périmée sans que rien ne le dise).
 *
 * `controllerchange` se déclenche aussi à la toute première activation d'un
 * service worker — passage de `null` à un contrôleur, sur une page qui
 * vient de s'ouvrir. Simuler une vraie mise à jour demanderait deux
 * générations distinctes du service worker servies dans le même run, ce que
 * ce dépôt ne fabrique pas à la volée ; l'événement natif
 * `controllerchange`, lui, est ce que le navigateur envoie réellement dans
 * les deux cas, et c'est lui que le composant écoute — le déclencher ici
 * directement teste donc la vraie logique de distinction, pas une
 * resimulation.
 */
test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('la toute première activation ne montre pas le bandeau', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    // Le passage de `null` à un contrôleur, à la première visite, déclenche
    // lui-même un `controllerchange` — exactement le cas qui ne doit rien
    // afficher.
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    )
    await expect(page.getByTestId('update-banner')).toHaveCount(0)
  })

  test('un changement de contrôleur après coup affiche le bandeau, et « Recharger » recharge', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    )

    // Un rechargement : la page est désormais contrôlée **dès le montage**,
    // c'est la situation où un futur changement de contrôleur est une vraie
    // mise à jour.
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Sentiers', exact: true }),
    ).toBeVisible()
    await expect(page.getByTestId('update-banner')).toHaveCount(0)

    await page.evaluate(() => {
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))
    })
    const banner = page.getByTestId('update-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Nouvelle version disponible')

    await page.getByTestId('update-reload').click()
    await expect(
      page.getByRole('heading', { name: 'Sentiers', exact: true }),
    ).toBeVisible({ timeout: 15_000 })
  })
})
