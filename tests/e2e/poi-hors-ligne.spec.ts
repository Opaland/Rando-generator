import { test, expect } from '@playwright/test'
import { buildGpx, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #153, quatrième pierre — les points d'intérêt hors ligne.
 *
 * Ce que ce fichier prouve, de bout en bout : emporter une randonnée range
 * ses points d'intérêt ; une fois Overpass injoignable, la fiche les montre
 * quand même **et dit d'où ils viennent**.
 *
 * Overpass répond en `POST`, que le Cache API ne sait pas ranger : les POI
 * ne suivent pas le chemin des tuiles, ils passent par IndexedDB. C'est ce
 * détour que ce test parcourt.
 */

/** Le service worker est doublé : ce test ne parle pas de tuiles. */
async function poserDoublure(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'controller', {
      configurable: true,
      get: () => ({ postMessage: () => undefined }),
    })
  })
}

/** Coupe la requête de points d'intérêt, et elle seule. */
async function couperLesPoi(page: import('@playwright/test').Page) {
  await page.route('**/api/interpreter', (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('drinking_water')) {
      void route.abort('failed')
      return
    }
    void route.fallback()
  })
}

/*
  Le clic sur la ligne **bascule** la sélection : refermer la fiche laisse
  l'itinéraire sélectionné, et re-cliquer le désélectionnerait au lieu de
  rouvrir. On ne clique donc que si le lien n'est pas déjà là — sans quoi le
  second passage de ce test attendait une carte qu'il venait de fermer.
*/
async function ouvrirLaFiche(page: import('@playwright/test').Page) {
  const lien = page.getByTestId('itinerary-card-detail-link')
  if ((await lien.count()) === 0) {
    await page
      .getByTestId('custom-list')
      .getByRole('button', { name: /boucle-test/ })
      .filter({ hasNotText: 'Supprimer' })
      .click()
  }
  await lien.click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
}

test('les points emportés restent là quand Overpass ne répond plus', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await poserDoublure(page)
  await page.goto('/')

  await page.getByTestId('custom-input').setInputFiles({
    name: 'boucle-test.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(0), 'utf-8'),
  })
  await expect(page.getByTestId('custom-list')).toContainText('boucle-test')
  await ouvrirLaFiche(page)

  // Réseau disponible : les points viennent d'Overpass, et rien ne parle
  // d'emport.
  const listePoi = page.getByTestId('detail-poi-list')
  await expect(listePoi).toBeVisible()
  await expect(page.getByTestId('poi-emportes')).toHaveCount(0)

  await page.getByTestId('itinerary-detail-emporter').click()
  // La réserve est écrite : on l'attend en base plutôt qu'à l'écran, l'écran
  // ne disant rien quand tout se passe bien.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const ouverture = indexedDB.open('sentiers')
              ouverture.onerror = () => {
                resolve(-1)
              }
              ouverture.onsuccess = () => {
                const base = ouverture.result
                if (!base.objectStoreNames.contains('poisEmportes')) {
                  base.close()
                  resolve(-1)
                  return
                }
                const compte = base
                  .transaction('poisEmportes', 'readonly')
                  .objectStore('poisEmportes')
                  .count()
                compte.onsuccess = () => {
                  base.close()
                  resolve(compte.result)
                }
                compte.onerror = () => {
                  base.close()
                  resolve(-1)
                }
              }
            }),
        ),
      { timeout: 10_000 },
    )
    .toBe(1)

  // Overpass tombe. On referme, on rouvre : la fiche se sert de la réserve.
  await couperLesPoi(page)
  await page.getByTestId('itinerary-detail-close').click()
  await ouvrirLaFiche(page)

  await expect(page.getByTestId('detail-poi-list')).toBeVisible()
  /*
    `toBeVisible` et non `toContainText` sur la mention : c'est la leçon de
    CLAUDE.md §1bis — `toContainText` lit aussi ce qui est en
    `display: none`, et dirait vrai d'une phrase que personne ne voit.
  */
  const mention = page.getByTestId('poi-emportes')
  await expect(mention).toBeVisible()
  await expect(mention).toContainText('Emportés aujourd’hui')
})

/**
 * Le pendant : sans réseau **et** sans réserve, on ne prétend pas qu'il n'y
 * a rien. « Aucun point d'intérêt répertorié à proximité » serait un
 * verdict sur le terrain, alors que c'est un aveu sur la connexion.
 */
test('sans réseau ni réserve, la fiche l’avoue au lieu de conclure', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await couperLesPoi(page)

  await page.getByTestId('custom-input').setInputFiles({
    name: 'boucle-test.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(0), 'utf-8'),
  })
  await expect(page.getByTestId('custom-list')).toContainText('boucle-test')
  await ouvrirLaFiche(page)

  const section = page.getByTestId('itinerary-detail')
  await expect(section).toContainText('Points d’intérêt indisponibles')
  await expect(section).not.toContainText(
    'Aucun point d’intérêt répertorié à proximité',
  )
})
