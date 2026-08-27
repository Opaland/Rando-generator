import { test, expect } from '@playwright/test'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }
import { afficherTousLesReseaux, mockTiles, MIRROR_1, MIRROR_2 } from './helpers.ts'

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

test('l’attente dissuade de recharger la page', async ({ page }) => {
  await mockTiles(page)
  const pending: { resolve: (() => void) | null } = { resolve: null }
  await page.route('**/api/interpreter', async (route) => {
    await new Promise<void>((resolve) => {
      pending.resolve = resolve
    })
    await route.fulfill({ json: pilatFixture })
  })
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  const loading = page.getByTestId('zone-loading')

  // Recharger est la réaction naturelle devant deux minutes d'attente, et la
  // pire : la requête repart de zéro et la charge Overpass augmente. Il faut
  // que ce soit écrit là où l'utilisateur regarde, pas dans « À propos ».
  await expect(loading).toContainText(/ne rechargez pas/i)
  await expect(loading).toContainText(/gardée sur votre appareil/i)
  await expect(page.getByTestId('zone-cancel')).toBeVisible()

  pending.resolve?.()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // L'attente finie, la consigne disparaît avec elle.
  await expect(loading).toHaveCount(0)
})

test('la bascule de miroir affiche un message de nouvelle tentative', async ({
  page,
}) => {
  await mockTiles(page)
  await page.route(MIRROR_1, (route) => route.abort())
  // Le second miroir répond, mais pas tout de suite.
  //
  // Le message « nouvelle tentative » ne vit qu'**entre** l'échec du
  // premier miroir et la réponse du second. Quand le second répondait
  // instantanément, l'état intermédiaire pouvait naître et mourir entre
  // deux sondages de Playwright : le test a rougi une fois dans une suite
  // complète, jamais isolé, et n'a pas été reproductible en cinq essais.
  // Un état transitoire ne se guette pas, il se retient.
  /*
    Le relâchement porte un drapeau, et pas seulement une fonction.

    La version précédente posait `ouvrir` **depuis le gestionnaire de
    route**, et le test l'appelait ensuite avec `?.()`. Si le gestionnaire
    n'avait pas encore tourné — le message « nouvelle tentative » naît quand
    l'application lance la requête, pas quand Playwright l'intercepte —
    `ouvrir` valait encore `null`, l'appel ne faisait rien en silence, et le
    second miroir restait bloqué à jamais. Mesuré : un échec sur la suite
    complète du 23/08, jamais reproduit isolément en trois essais.

    C'est la même faute que dans `fermerLeGuide` le matin même : un test qui
    suppose un ordre que rien ne garantit. Le drapeau supprime l'ordre au
    lieu de parier dessus.
  */
  const relachement: { demande: boolean; ouvrir: (() => void) | null } = {
    demande: false,
    ouvrir: null,
  }
  await page.route(MIRROR_2, async (route) => {
    if (!relachement.demande) {
      await new Promise<void>((resolve) => {
        relachement.ouvrir = resolve
      })
    }
    await route.fulfill({ json: pilatFixture })
  })
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-loading')).toContainText(
    /nouvelle tentative/i,
  )
  relachement.demande = true
  relachement.ouvrir?.()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
})
