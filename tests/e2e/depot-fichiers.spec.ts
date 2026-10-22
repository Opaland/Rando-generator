import { test, expect } from '@playwright/test'
import {
  buildGpx,
  mockExternalNetwork,
  fermerLeGuide,
  ouvrirOnglet,
} from './helpers.ts'
import { buildFit } from '../fixtures/fit.ts'
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

  /*
    Issue #562 — le dépôt ne gardait que les `.gpx`, alors que le texte
    annonce « GPX, FIT ou TCX » et l'archive d'export, et que la lecture
    reconnaît le format **au contenu**. Un `.fit` déposé avec un `.GPX`
    disparaissait sans un mot ; un fichier qui n'est pas une trace aussi.
  */
  test('un dépôt mixte importe chaque trace, et dit ce qu’il n’a pas su lire', async ({
    page,
  }) => {
    await ouvrirLeDepot(page)
    const fit = buildFit(
      Array.from({ length: 30 }, (_, i) => ({
        timestamp: 1_000_000 + i * 10,
        lat: 45.4,
        lon: 4.5 + i * 0.0002,
        altitude: 800,
      })),
    )
    const depot = await page.evaluateHandle(
      ({ gpx, fit }) => {
        const transfert = new DataTransfer()
        transfert.items.add(new File([gpx], 'A.GPX'))
        transfert.items.add(new File([new Uint8Array(fit)], 'b.fit'))
        transfert.items.add(new File(['des notes'], 'notes.txt'))
        return transfert
      },
      { gpx: buildGpx(15), fit: Array.from(new Uint8Array(fit)) },
    )
    await page.getByTestId('gpx-dropzone').dispatchEvent('drop', {
      dataTransfer: depot,
    })

    const liste = page.getByTestId('tracks-list')
    await expect(liste).toContainText('A.GPX', { timeout: 15_000 })
    await expect(liste).toContainText('b.fit')
    await expect(page.getByTestId('gpx-errors')).toContainText('notes.txt')
  })
})
