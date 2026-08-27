import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, mockElevation } from './helpers.ts'

/**
 * Le code couleur des points d'intérêt (demande de Cédric, 23/08).
 *
 * Douze teintes peintes par MapLibre, et aucune légende : le code n'était
 * lisible nulle part. Retrouver sur la carte le refuge qu'on venait de lire
 * dans la liste demandait de deviner.
 *
 * Ce fichier garde ce qu'une personne voit : **la liste porte les couleurs**,
 * et deux catégories différentes n'ont pas la même. Que ce soit la couleur du
 * marqueur est établi par `tests/unit/poiCouleurs.test.ts` et
 * `tests/unit/mapPoiCouleurs.test.ts` — la carte et la liste lisent la même
 * constante, et un test unitaire le dit mieux qu'une lecture des entrailles
 * de MapLibre.
 */
test('la liste des points d’intérêt porte leurs couleurs', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const liste = page.getByTestId('detail-poi-list')
  await expect(liste).toBeVisible({ timeout: 15_000 })

  const pastilles = liste.locator('[data-testid^="poi-pastille-"]')
  expect(await pastilles.count()).toBeGreaterThan(1)

  // La couleur **peinte**, pas celle qu'on vient d'écrire dans l'attribut :
  // relire son propre `style` ne répond pas à la question posée
  // (CLAUDE.md §1bis).
  const peintes = await pastilles.evaluateAll((elements) =>
    elements.map((el) => ({
      genre: (el.getAttribute('data-testid') ?? '').replace('poi-pastille-', ''),
      fond: getComputedStyle(el).backgroundColor,
    })),
  )

  for (const { fond } of peintes) {
    expect(fond).toMatch(/^rgb\(/)
    // Ni transparente ni blanche : une pastille invisible ne code rien.
    expect(fond).not.toBe('rgba(0, 0, 0, 0)')
    expect(fond).not.toBe('rgb(255, 255, 255)')
  }

  // Deux genres différents ne portent jamais la même couleur — c'est tout ce
  // qu'un code couleur promet, et c'est ce qui manquait à `ruins` et
  // `marker`, séparés de ΔE 11,7 avant ce lot.
  const parGenre = new Map(peintes.map((p) => [p.genre, p.fond]))
  expect(new Set(parGenre.values()).size).toBe(parGenre.size)
})
