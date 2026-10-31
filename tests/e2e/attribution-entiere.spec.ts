import { test, expect } from '@playwright/test'
import { estAlEcran, fermerLeGuide, mockExternalNetwork, ouvrirOnglet } from './helpers.ts'

/**
 * #542 — l'attribution d'une licence ouverte n'est pas un détail : au
 * téléphone, on lisait « Source : C… », 15 % du nom. Tranché le 31/10 : le nom
 * entier, sur toute la largeur de la ligne, sur plusieurs lignes s'il le faut.
 */
const AUTEUR = 'Communauté de Communes du Haut-Beaujolais et des Monts du Lyonnais'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test('au téléphone, la source d’un import se lit en entier', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await ouvrirOnglet(page, 'sorties')
  await page.getByTestId('custom-input').setInputFiles({
    name: 'pdipr.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(
      JSON.stringify({
        type: 'FeatureCollection',
        attribution: AUTEUR,
        license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Sentier des Monts' },
            geometry: {
              type: 'LineString',
              coordinates: Array.from({ length: 30 }, (_, i) => [4.5 + i * 0.002, 45.4]),
            },
          },
        ],
      }),
    ),
  })

  const source = page.getByTestId('custom-source')
  await expect(source).toContainText(AUTEUR)
  await source.scrollIntoViewIfNeeded()
  await expect.poll(() => estAlEcran(page, 'custom-source')).toBe(true)
  // `textContent` ne dit rien d'une coupure : c'est la boîte qui la dit.
  const boite = await source.evaluate((e) => ({
    rogne: e.scrollWidth > e.clientWidth + 1,
    largeur: e.getBoundingClientRect().width,
    ligne: e.closest('button')?.getBoundingClientRect().width ?? 0,
  }))
  expect(boite.rogne, JSON.stringify(boite)).toBe(false)
  // Toute la largeur de la ligne, pas la colonne du nom : une lettre par ligne
  // ne serait pas rognée non plus.
  expect(boite.largeur, JSON.stringify(boite)).toBeGreaterThan(boite.ligne * 0.8)
})
