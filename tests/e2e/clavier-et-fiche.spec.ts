import { test, expect, type Page } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #568 — clavier et fiche.
 *
 * 1. Le focus se perdait : ouverte par Entrée, puis fermée par Échap ou par
 *    la croix, la fiche laissait `document.activeElement` sur `BODY` dans
 *    les deux sens. `src/` ne contenait aucun `.focus()` (WCAG 2.4.3).
 * 2. Échap fermait la fiche même quand il servait à fermer « À propos ».
 */
test.use({ viewport: { width: 1280, height: 800 } })

async function ouvrirParLeClavier(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
}

/** Le focus est-il dans l'élément désigné (lui ou l'un de ses enfants) ? */
function focusDans(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const cible = document.querySelector(`[data-testid="${id}"]`)
    return cible !== null && cible.contains(document.activeElement)
  }, testId)
}

test('ouverte au clavier, la fiche prend le focus, et le rend à la fermeture', async ({
  page,
}) => {
  await ouvrirParLeClavier(page)
  await expect.poll(() => focusDans(page, 'itinerary-detail')).toBe(true)

  await page.getByTestId('itinerary-detail-close').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)
  await expect
    .poll(() => focusDans(page, 'itinerary-card-detail-link'))
    .toBe(true)
})

test('fermée par Échap, le focus revient sur la ligne de l’itinéraire', async ({
  page,
}) => {
  await ouvrirParLeClavier(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)
  // Échap désélectionne : le lien qui avait ouvert la fiche a disparu avec
  // la carte de l'itinéraire. Le focus revient sur sa ligne dans la liste.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.closest('[data-testid="itinerary-list"]') !==
            null && document.activeElement?.textContent.includes('GR 7'),
      ),
    )
    .toBe(true)
})

test('Échap dans « À propos » ne ferme pas la fiche', async ({ page }) => {
  await ouvrirParLeClavier(page)
  await page.getByTestId('about-open').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
})

/*
  Issue #568, point 3 — sur téléphone, Retour avec une fiche ouverte
  quittait l'application. Tranché par Cédric le 20/10 : Retour **ferme la
  fiche**, comme dans une application ; Suivant ne la rouvre pas.
*/
test.describe('le bouton Retour', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('ferme la fiche au lieu de quitter l’application', async ({ page }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await page.getByTestId('onboarding-fermer').click()
    await page.getByTestId('zone-pilat').click()
    await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
      timeout: 15_000,
    })
    await afficherTousLesReseaux(page)
    await page
      .getByTestId('itinerary-list')
      .getByRole('button', { name: /GR 7/ })
      .first()
      .click()
    await page.getByTestId('itinerary-card-detail-link').click()
    await expect(page.getByTestId('itinerary-detail')).toBeVisible()
    const adresse = page.url()

    await page.goBack()
    await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)
    // Toujours dans l'application : même adresse, et la carte de
    // l'itinéraire revenue à la place de la fiche.
    expect(page.url()).toBe(adresse)
    await expect(page.getByTestId('itinerary-card-detail-link')).toBeVisible()

    await page.goForward()
    await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)
  })

  test('fermée par la croix, Retour n’a pas à la fermer une seconde fois', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await page.getByTestId('onboarding-fermer').click()
    await page.getByTestId('zone-pilat').click()
    await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
      timeout: 15_000,
    })
    await afficherTousLesReseaux(page)
    await page
      .getByTestId('itinerary-list')
      .getByRole('button', { name: /GR 7/ })
      .first()
      .click()
    await page.getByTestId('itinerary-card-detail-link').click()
    await expect(page.getByTestId('itinerary-detail')).toBeVisible()
    await page.getByTestId('itinerary-detail-close').click()
    await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)
    // L'entrée posée à l'ouverture a été rendue : Retour quitte bien la
    // page, au lieu de « fermer » une fiche qui n'est plus là. Sans ce
    // rendu, il faudrait deux Retour pour partir — le premier ne ferait
    // rien de visible.
    await page.goBack()
    await expect.poll(() => page.url()).not.toContain('localhost')
  })
})
