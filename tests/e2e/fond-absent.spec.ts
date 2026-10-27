import { test, expect, type Page } from '@playwright/test'
import {
  afficherTousLesReseaux,
  estAlEcran,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  ouvrirLaFicheDuGr7,
} from './helpers.ts'

/**
 * Issue #593 — hors du plan IGN, la fiche le dit et ne propose pas
 * d'emporter des tuiles qui n'existent pas.
 *
 * Mesuré : en Nouvelle-Calédonie, `PLANIGNV2` rend 404 dès le zoom 8. Le
 * réseau réel n'est pas joint ici : la Géoplateforme est simulée, 404 d'un
 * côté, tuile servie de l'autre — ce qui est éprouvé est la réaction de la
 * fiche au statut, sur le Pilat de la fixture.
 */
test.use({ viewport: { width: 1280, height: 800 } })

async function ouvrirAvecLePlan(page: Page, statut: 200 | 404): Promise<void> {
  await mockExternalNetwork(page)
  await mockElevation(page)
  // Posé après `mockExternalNetwork` : la dernière route déclarée l'emporte.
  await page.route('https://data.geopf.fr/wmts**', (route) =>
    route.fulfill({ status: statut, contentType: 'image/png', body: '' }),
  )
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await ouvrirLaFicheDuGr7(page, false)
}

test('hors du plan IGN, la fiche le dit et ne propose pas d’emporter', async ({ page }) => {
  await ouvrirAvecLePlan(page, 404)
  // Ce qui est peint, pas ce qui existe (§1bis).
  await expect.poll(() => estAlEcran(page, 'fond-indisponible')).toBe(true)
  await expect(page.getByTestId('itinerary-detail-emporter')).toHaveCount(0)
})

test('sous le plan IGN, « Emporter » reste proposé, et rien ne parle d’absence', async ({
  page,
}) => {
  await ouvrirAvecLePlan(page, 200)
  await expect.poll(() => estAlEcran(page, 'itinerary-detail-emporter')).toBe(true)
  await expect(page.getByTestId('fond-indisponible')).toHaveCount(0)
})
