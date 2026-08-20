import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Import d'un GeoJSON de sentiers (issue #87).
 *
 * Les PDIPR départementaux sont publiés en GeoJSON. Plutôt qu'un lecteur par
 * département, l'application lit le format : l'utilisateur télécharge le
 * fichier chez le producteur et le dépose ici. Le Rhône, lui, reste fermé —
 * son téléchargement libre n'est pas activé côté Conseil Départemental.
 */
function pdiprFactice(): string {
  const ligne = (depart: number, points: number, lat: number) => {
    const coords: [number, number][] = []
    for (let i = 0; i < points; i += 1) {
      coords.push([Number((4.5 + (depart + i) * 0.0002).toFixed(6)), lat])
    }
    return coords
  }
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { nom: 'Boucle des Trois Croix' },
        geometry: { type: 'LineString', coordinates: ligne(0, 40, 45.4) },
      },
      {
        type: 'Feature',
        properties: { libelle: 'Sentier du Vallon' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [ligne(0, 30, 45.42), ligne(40, 30, 45.42)],
        },
      },
      {
        type: 'Feature',
        properties: { code: 'P12' },
        geometry: { type: 'Point', coordinates: [4.5, 45.4] },
      },
    ],
  })
}

test('un GeoJSON départemental devient autant d’itinéraires à compléter', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('custom-input').setInputFiles({
    name: 'pdipr-01.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(pdiprFactice(), 'utf-8'),
  })

  const liste = page.getByTestId('custom-list')
  // Chaque sentier garde son nom, quelle que soit la colonne du producteur.
  await expect(liste).toContainText('Boucle des Trois Croix')
  await expect(liste).toContainText('Sentier du Vallon')
  // Le poteau de signalisation n'est pas un itinéraire, et n'est pas une erreur.
  await expect(page.getByTestId('gpx-errors')).toHaveCount(0)
})

test('un fichier projeté en Lambert 93 est refusé, en disant quoi faire', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Le piège des données françaises : tracées telles quelles, ces lignes
  // atterriraient dans le golfe de Guinée.
  const lambert = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { nom: 'Sentier mal projeté' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [842_000, 6_517_000],
            [842_100, 6_517_100],
          ],
        },
      },
    ],
  })
  await page.getByTestId('custom-input').setInputFiles({
    name: 'pdipr-lambert.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(lambert, 'utf-8'),
  })

  await expect(page.getByTestId('gpx-errors')).toContainText(/WGS84|Lambert/)
})
