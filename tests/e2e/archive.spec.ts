import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'
import { buildZip, gzip } from '../fixtures/zip.ts'

/**
 * Import d'une archive d'export Strava / Garmin (issue #89).
 *
 * C'est ce qui tient lieu de connecteur : l'API Strava impose un secret
 * OAuth, qui ne peut pas vivre dans une application statique sans être
 * publié. L'utilisateur exporte ses données chez eux et dépose l'archive
 * ici — rien ne sort du navigateur.
 */
function gpxLeLongDuGr7(depart: number, points: number): string {
  const lat = 45.4 + 15 / 111_195
  const trkpts: string[] = []
  for (let i = 0; i < points; i += 1) {
    const lon = (4.5 + (depart + i) * 0.0002).toFixed(6)
    trkpts.push(`<trkpt lat="${lat}" lon="${lon}"><ele>${800 + (i % 30)}</ele></trkpt>`)
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${trkpts.join('')}</trkseg></trk></gpx>`
}

test('une archive d’export s’ouvre sur l’appareil et livre ses traces', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  const archive = await buildZip([
    { nom: 'activities/1001.gpx', contenu: gpxLeLongDuGr7(0, 76) },
    {
      nom: 'activities/1002.gpx.gz',
      contenu: await gzip(gpxLeLongDuGr7(75, 76)),
      methode: 0,
    },
    { nom: 'profile.csv', contenu: 'nom,prenom\nBernard,Test' },
    { nom: 'media/photo.jpg', contenu: 'pas une trace', methode: 0 },
  ])

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'export_strava.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  })

  // Les deux traces sortent de l'archive, dossier et .gz retirés du nom.
  await expect(page.getByTestId('tracks-list')).toContainText('1001.gpx')
  await expect(page.getByTestId('tracks-list')).toContainText('1002.gpx')
  // Ensemble, elles couvrent le GR 7 comme le ferait un seul fichier.
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  // Le CSV et la photo ne sont pas des erreurs : ils ne nous concernent pas.
  await expect(page.getByTestId('gpx-errors')).toHaveCount(0)
})

test('une archive sans trace le dit, au lieu de ne rien faire', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const archive = await buildZip([
    { nom: 'profile.csv', contenu: 'nom,prenom' },
  ])
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'export_vide.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  })

  await expect(page.getByTestId('gpx-errors')).toContainText(/aucune trace/i)
})
