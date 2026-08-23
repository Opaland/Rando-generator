import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Retour utilisateur : « il faut que quand on ouvre l'appli on peut fermer
 * l'accordéon (toujours affiché) et l'écran d'affichage sentier ».
 *
 * Deux surfaces s'ouvraient seules et ne se fermaient pas :
 *
 * - le guide « Bienvenue sur Sentiers », affiché tant qu'aucune donnée n'est
 *   chargée — c'est-à-dire exactement pendant qu'on veut regarder la carte
 *   pour décider ;
 * - le panneau latéral au-dessus de 800 px, où la poignée de la feuille est
 *   masquée en CSS : 390 px de carte pris définitivement.
 *
 * Ce que ces tests gardent, ce n'est pas « le bouton existe » mais **qu'il
 * n'existe aucun état où l'on a fermé sans pouvoir rouvrir**. C'est la règle
 * qui compte : le premier jet du guide se fermait pour de bon.
 */

test.beforeEach(async ({ page }) => {
  await mockExternalNetwork(page)
})

test('le guide de démarrage se ferme, et se retrouve', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('onboarding')).toBeVisible()

  await page.getByTestId('onboarding-fermer').click()
  await expect(page.getByTestId('onboarding')).toBeHidden()

  const rappel = page.getByTestId('onboarding-rouvrir')
  await expect(rappel).toBeVisible()
  await rappel.click()
  await expect(page.getByTestId('onboarding')).toBeVisible()
  await expect(rappel).toBeHidden()
})

test('le guide fermé le reste après rechargement', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('onboarding-fermer').click()
  await expect(page.getByTestId('onboarding')).toBeHidden()
  // Le réglage part en IndexedDB de façon asynchrone : on attend qu'il y
  // soit écrit avant de recharger, sinon le test mesure une course et non
  // une persistance (leçon du test de seuil, PR #202).
  await expect(page.getByTestId('onboarding-rouvrir')).toBeVisible()
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const requete = indexedDB.open('sentiers')
        requete.onerror = () => {
          resolve(false)
        }
        requete.onsuccess = () => {
          const base = requete.result
          if (!base.objectStoreNames.contains('settings')) {
            base.close()
            resolve(false)
            return
          }
          const lecture = base
            .transaction('settings', 'readonly')
            .objectStore('settings')
            .get('guideFerme')
          lecture.onsuccess = () => {
            base.close()
            resolve(lecture.result === 1)
          }
          lecture.onerror = () => {
            base.close()
            resolve(false)
          }
        }
      }),
    undefined,
    { timeout: 10_000 },
  )

  await page.reload()
  await expect(page.getByTestId('onboarding-rouvrir')).toBeVisible()
  await expect(page.getByTestId('onboarding')).toBeHidden()
})

test.describe('sur grand écran', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('le panneau se replie, et se rouvre', async ({ page }) => {
    await page.goto('/')
    const panneau = page.getByTestId('sidebar')
    await expect(panneau).toBeVisible()

    const largeurCarteAvant = await page
      .locator('main')
      .evaluate((element) => element.getBoundingClientRect().width)

    await page.getByTestId('panneau-replier').click()
    await expect(panneau).toBeHidden()

    // Ce qu'on replie doit rendre la place : sans cette mesure, le test
    // passerait sur un panneau caché qui occuperait toujours sa colonne.
    const largeurCarteApres = await page
      .locator('main')
      .evaluate((element) => element.getBoundingClientRect().width)
    expect(largeurCarteApres).toBeGreaterThan(largeurCarteAvant + 200)

    const rendre = page.getByTestId('panneau-rendre')
    await expect(rendre).toBeVisible()

    // Il se nomme, et sa cible se touche. Un chevron de 28 px sans étiquette
    // se replie facilement et se retrouve mal (AUDIT_UX.md, constat U13).
    await expect(rendre).toContainText('Zones, traces et réglages')
    const boite = await rendre.boundingBox()
    expect(boite?.height ?? 0, 'la cible est trop courte pour se viser').toBeGreaterThanOrEqual(44)

    await rendre.click()
    await expect(panneau).toBeVisible()
    await expect(rendre).toBeHidden()
  })

  test('le panneau replié le reste après rechargement', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('panneau-replier').click()
    await expect(page.getByTestId('panneau-rendre')).toBeVisible()
    await page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const requete = indexedDB.open('sentiers')
          requete.onerror = () => {
            resolve(false)
          }
          requete.onsuccess = () => {
            const base = requete.result
            if (!base.objectStoreNames.contains('settings')) {
              base.close()
              resolve(false)
              return
            }
            const lecture = base
              .transaction('settings', 'readonly')
              .objectStore('settings')
              .get('panneauReplie')
            lecture.onsuccess = () => {
              base.close()
              resolve(lecture.result === 1)
            }
            lecture.onerror = () => {
              base.close()
              resolve(false)
            }
          }
        }),
      undefined,
      { timeout: 10_000 },
    )

    await page.reload()
    await expect(page.getByTestId('panneau-rendre')).toBeVisible()
    await expect(page.getByTestId('sidebar')).toBeHidden()
  })
})

test.describe('sur téléphone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /**
   * En dessous de 800 px, la feuille glissante a déjà ses trois positions.
   * Un second mécanisme de repli sur la même surface se contredirait avec le
   * premier : la poignée resterait, mais rendrait une feuille que le repli
   * dit fermée.
   */
  test('le repli du panneau n’existe pas : la poignée fait ce travail', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('sheet-handle')).toBeVisible()
    await expect(page.getByTestId('panneau-replier')).toBeHidden()
    await expect(page.getByTestId('panneau-rendre')).toHaveCount(0)
  })
})
