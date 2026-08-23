import { test, expect } from '@playwright/test'
import { mockExternalNetwork, fermerLeGuide, ouvrirOnglet } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * AUDIT_UX.md, constat U12 — « Glissez vos fichiers GPX, FIT ou TCX ici, ou
 * parcourez vos fichiers » menait sur un téléphone, où le glisser-déposer
 * n'existe pas. La seule action possible arrivait en second, derrière un
 * « ou ».
 *
 * Ce qui est gardé : **le geste qui marche là où on est passe devant**, et
 * la mention du glisser-déposer n'apparaît que là où il est possible. La
 * condition porte sur l'entrée et non sur la largeur — une tablette de
 * 900 px n'a pas plus de souris qu'un téléphone.
 */

async function ouvrirLeDepot(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await ouvrirOnglet(page, 'sorties')
  await expect(page.getByTestId('gpx-dropzone')).toBeVisible()
}

test.describe('au doigt', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('l’action possible mène, et rien ne parle de glisser', async ({ page }) => {
    await ouvrirLeDepot(page)
    const depot = page.getByTestId('gpx-dropzone')
    await expect(depot).toContainText('Choisissez vos fichiers')
    // `toContainText` lit le `textContent`, `display: none` compris : il ne
    // sait pas distinguer ce qui est écrit de ce qui est montré. On vise donc
    // la visibilité de la mention, pas la présence du mot.
    await expect(page.getByTestId('depot-glisser')).toBeHidden()
    // Et c'est bien un bouton, pas une phrase : il ouvre le sélecteur.
    await expect(page.getByTestId('gpx-browse')).toBeVisible()
  })

  test('le guide de démarrage ne parle pas de glisser non plus', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    const guide = page.getByTestId('onboarding')
    await expect(guide).toBeVisible()
    await expect(guide).not.toContainText(/gliss/i)
    // Insensible à la casse : la phrase a été reprise quand
    // l'enregistrement d'une sortie est passé devant (« Enregistrez votre
    // sortie, ou ajoutez vos fichiers GPX »). Ce que ce test garde est que
    // le chemin par fichier reste nommé, pas la majuscule d'un mot.
    await expect(guide).toContainText(/ajoutez vos fichiers GPX/i)
  })
})

test.describe('à la souris', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('le glisser-déposer reste mentionné', async ({ page }) => {
    await ouvrirLeDepot(page)
    const depot = page.getByTestId('gpx-dropzone')
    await expect(depot).toContainText('Choisissez vos fichiers')
    await expect(page.getByTestId('depot-glisser')).toBeVisible()
    await expect(page.getByTestId('depot-glisser')).toContainText(
      /glissez-les ici/i,
    )
  })
})
