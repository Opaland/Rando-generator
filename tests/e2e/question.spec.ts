import { test, expect } from '@playwright/test'
import {
  mockExternalNetwork,
  mockTilesOk,
  fermerLeGuide,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * La question en toutes lettres — pierre 0 de `docs/IA_LOCALE.md`.
 *
 * Les règles de lecture ont leurs tests unitaires, et cinq réinjections
 * (§1). Ce fichier vérifie la seule chose qu'ils ne peuvent pas voir :
 * **que la phrase change ce qui est à l'écran**, et que ce qu'elle n'a pas
 * compris s'écrit.
 */
test.describe('une question en toutes lettres', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalNetwork(page)
    await mockTilesOk(page)
    await page.goto('/')
    await fermerLeGuide(page)
    await page.getByTestId('zone-pilat').click()
    await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
      timeout: 15_000,
    })
    await ouvrirOnglet(page, 'progression')
    await page.getByTestId('discovery-filters').locator('summary').click()
  })

  test('pose les paliers, et montre le nombre qu’on a écrit', async ({
    page,
  }) => {
    await page.getByTestId('list-question').fill('une boucle de moins de 12 km')
    await page.getByTestId('list-question-ok').click()

    /*
      Le nombre s'affiche tel qu'il a été demandé, et non rangé dans le
      palier « 10 à 20 km » — qui écarterait les randos de trois kilomètres
      que personne n'a exclues.
    */
    await expect(page.getByTestId('list-length')).toHaveValue('question')
    await expect(page.getByTestId('list-length')).toContainText(
      'moins de 12 km',
    )
    await expect(page.getByTestId('list-shape')).toHaveValue('loop')
  })

  test('écrit ce qu’elle n’a pas compris', async ({ page }) => {
    await page
      .getByTestId('list-question')
      .fill('une boucle de moins de 12 km avec des chèvres')
    await page.getByTestId('list-question-ok').click()

    const dit = page.getByTestId('question-incompris')
    await expect(dit).toBeVisible()
    await expect(dit).toContainText('chèvres')
    // Et elle a quand même fait ce qu'elle savait faire.
    await expect(page.getByTestId('list-shape')).toHaveValue('loop')
  })

  test('choisir un palier à la main reprend la main', async ({ page }) => {
    await page.getByTestId('list-question').fill('moins de 12 km')
    await page.getByTestId('list-question-ok').click()
    await expect(page.getByTestId('list-length')).toHaveValue('question')

    // Index 1 = « moins de 5 km ».
    await page.getByTestId('list-length').selectOption('1')
    await expect(page.getByTestId('list-length')).toHaveValue('1')
    /*
      L'option « d'après votre phrase » disparaît : la laisser afficherait un
      choix qui ne s'applique plus, et c'est précisément le genre de panneau
      qui ment sans qu'on s'en aperçoive.
    */
    await expect(page.getByTestId('list-length')).not.toContainText(
      'd’après votre phrase',
    )
  })

  test('une phrase sans aucun filtre ne filtre rien', async ({ page }) => {
    await page.getByTestId('list-question').fill('où est-ce qu’on mange bien ?')
    await page.getByTestId('list-question-ok').click()
    await expect(page.getByTestId('question-incompris')).toBeVisible()
    await expect(page.getByTestId('list-length')).toHaveValue('0')
    await expect(page.getByTestId('list-shape')).toHaveValue('all')
  })
})
