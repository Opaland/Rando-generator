import { test, expect } from '@playwright/test'
import { fermerLeGuide, mockExternalNetwork, mockTilesOk } from './helpers.ts'

/**
 * Issue #296 — Karim exporte depuis Garmin : `activity_18274639.gpx`. Il
 * tape « Pilat ». #206 ne retrouvait que les traces importées **pendant**
 * qu'une zone était chargée ; ici, aucune ne l'est, et la recherche doit
 * quand même trouver les sorties du Pilat par les contours embarqués
 * (`public/data/contours-de-zone.json`, tranché le 22/10).
 *
 * Le fichier de contours est le vrai, servi par la prévisualisation : ce
 * qui est éprouvé est le chemin entier, du chargement à la recherche.
 */
function gpx(nom: string, lon: number, lat: number, rang: number) {
  // Chaque trace distincte : l'empreinte écarterait des doublons (#165).
  const trkpts = Array.from(
    { length: 12 },
    (_, i) =>
      `<trkpt lat="${(lat + rang * 0.001).toFixed(6)}" lon="${(lon + i * 0.0005).toFixed(6)}"><ele>800</ele></trkpt>`,
  ).join('')
  return {
    name: nom,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<metadata><time>2026-06-${String(rang + 1).padStart(2, '0')}T08:00:00Z</time></metadata>` +
        `<trk><trkseg>${trkpts}</trkseg></trk></gpx>`,
      'utf-8',
    ),
  }
}

test('sans zone chargée, « pilat » retrouve les sorties du Pilat, et elles seules', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)

  /*
    Trente traces : le champ de recherche n'apparaît qu'à `SEUIL_GROUPEMENT`.
    Quinze autour de Pélussin, dans le Pilat ; huit à Paris, dans aucune
    zone ; sept à Roanne, dans la Loire mais loin du Pilat — le cas que la
    relecture adverse du 30/10 a trouvé : la zone « Rhône, Loire et Pilat »
    collait « Pilat » à toute la Loire. Aucune zone n'est chargée :
    `zoneALImport` reste vide, et seul le contour peut ranger ces sorties.
  */
  await page.getByTestId('gpx-input').setInputFiles([
    ...Array.from({ length: 15 }, (_, i) =>
      gpx(`activity_10${String(i).padStart(2, '0')}.gpx`, 4.68, 45.41, i),
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      gpx(`activity_20${String(i).padStart(2, '0')}.gpx`, 2.34, 48.85, i + 15),
    ),
    ...Array.from({ length: 7 }, (_, i) =>
      gpx(`activity_30${String(i).padStart(2, '0')}.gpx`, 4.06, 46.03, i + 23),
    ),
  ])
  await expect(page.getByTestId('tracks-compte')).toContainText('30 sorties', {
    timeout: 30_000,
  })

  const champ = page.getByTestId('tracks-recherche')
  await champ.fill('pilat')
  // On compte des éléments, pas du texte : un groupe replié garde ses noms
  // dans le DOM (§1bis).
  const pilat = page.locator('[data-testid^="track-toggle-activity_10"]')
  const paris = page.locator('[data-testid^="track-toggle-activity_20"]')
  const roanne = page.locator('[data-testid^="track-toggle-activity_30"]')
  await expect(pilat).toHaveCount(15)
  await expect(paris).toHaveCount(0)
  await expect(roanne).toHaveCount(0)

  // Le département, lui, les prend toutes les deux : le Pilat est dans la
  // Loire, Roanne aussi.
  await champ.fill('loire')
  await expect(pilat).toHaveCount(15)
  await expect(roanne).toHaveCount(7)
  await expect(paris).toHaveCount(0)
})
