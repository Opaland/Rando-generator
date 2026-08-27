import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, mockElevation } from './helpers.ts'

/**
 * La fixture Pilat ne contient que des tracés de quelques kilomètres, sous le
 * seuil de découpage : on sert ici le même GR de 60 km qu'`etapes.spec.ts`,
 * pour que le découpage — et donc son export — ait un sujet.
 */
function grLong(): unknown {
  const membres = [0, 1, 2].map((troncon) => ({
    type: 'way',
    ref: 900 + troncon,
    role: '',
    geometry: Array.from({ length: 21 }, (_, i) => ({
      lat: 45.4,
      lon: 4.5 + (troncon * 20 + i) / 78,
    })),
  }))
  return {
    elements: [
      {
        type: 'relation',
        id: 2001,
        tags: {
          type: 'route',
          route: 'hiking',
          network: 'nwn',
          ref: 'GR 400',
          name: 'Grande traversée d’essai',
        },
        members: membres,
      },
    ],
  }
}

/**
 * Issue #161, point 2 — emporter son découpage.
 *
 * Camille prépare trois semaines sur la Grande Traversée des Alpes. Le
 * découpage était la seule chose qu'elle construisait ici, et c'était la
 * seule qui ne sortait pas.
 */
test('le découpage s’exporte en GPX, avec ses coupures', async ({ page }) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(grLong())
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 400/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  // Le bouton n'existe que si l'itinéraire est assez long pour être découpé.
  const etapes = page.getByTestId('detail-stages')
  await expect(etapes).toBeVisible()

  const attente = page.waitForEvent('download')
  await page.getByTestId('etapes-export').click()
  const fichier = await attente
  const gpx = await readFile(await fichier.path(), 'utf-8')

  expect(fichier.suggestedFilename()).toMatch(/etapes/)
  // Le tracé entier est là…
  expect(gpx).toContain('<trkpt lat=')
  // …et les coupures aussi, ce qui est tout l'objet.
  expect(gpx).toContain('<wpt lat=')
  expect(gpx).toContain('Départ')
  expect(gpx).toMatch(/Arrivée — [\d,]+ km/)
  // L'attribution ODbL suit l'itinéraire OSM, comme pour l'export complet.
  expect(gpx).toContain('<copyright')

  /*
    L'ordre imposé par le schéma GPX 1.1 : metadata, wpt, trk. Vérifié ici et
    non seulement en unitaire, parce que c'est le fichier réellement produit
    par l'application qui doit être valide — pas celui d'une fonction pure.
  */
  expect(gpx.indexOf('</metadata>')).toBeLessThan(gpx.indexOf('<wpt '))
  expect(gpx.lastIndexOf('</wpt>')).toBeLessThan(gpx.indexOf('<trk>'))
})
