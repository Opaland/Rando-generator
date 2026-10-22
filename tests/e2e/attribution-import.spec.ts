import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Issue #87 — l'attribution de Léa, de bout en bout.
 *
 * Elle importe le PDIPR de son département, ouvert sous Licence Ouverte.
 * Avant, le fichier devenait un itinéraire `PERSO` et son export GPX ne
 * portait aucune attribution — ce que la licence interdit.
 */
function pdipr(avecSource: boolean): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    ...(avecSource
      ? {
          attribution: 'Département de l’Ain',
          license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
        }
      : {}),
    features: [
      {
        type: 'Feature',
        properties: { name: 'Sentier des Monts' },
        geometry: {
          type: 'LineString',
          coordinates: Array.from({ length: 30 }, (_, i) => [
            4.5 + i * 0.002,
            45.4,
          ]),
        },
      },
    ],
  })
}

async function importer(
  page: import('@playwright/test').Page,
  contenu: string,
) {
  await page.getByTestId('custom-input').setInputFiles({
    name: 'pdipr-ain.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(contenu, 'utf-8'),
  })
  const liste = page.getByTestId('custom-list')
  await expect(liste).toContainText('Sentier des Monts')
  await liste
    .getByRole('button', { name: /Sentier des Monts/ })
    .filter({ hasNotText: 'Supprimer' })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
}

test('un fichier qui déclare sa source la porte jusqu’au GPX', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await importer(page, pdipr(true))

  // Rien à signaler : la source est connue.
  await expect(page.getByTestId('detail-source-absente')).toHaveCount(0)

  const attente = page.waitForEvent('download')
  await page.getByTestId('itinerary-detail-export').click()
  const gpx = await readFile(await (await attente).path(), 'utf-8')

  expect(gpx).toContain('<copyright author="Département de l’Ain">')
  expect(gpx).toContain('etalab.gouv.fr/licence-ouverte')
})

/**
 * Issue #541 — Léa : un PDIPR importé n'est pas distingué comme source
 * institutionnelle dans « Mes itinéraires ». L'attribution était déjà portée
 * jusqu'au GPX (test précédent) ; rien ne la montrait dans la liste
 * elle-même, où elle se confondait avec un tracé personnel sans source.
 */
test('la liste « Mes itinéraires » montre la source quand le fichier la déclare', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('custom-input').setInputFiles({
    name: 'pdipr-ain.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(pdipr(true), 'utf-8'),
  })

  const liste = page.getByTestId('custom-list')
  await expect(liste).toContainText('Sentier des Monts')
  await expect(liste).toContainText('Source : Département de l’Ain')
})

/**
 * Et sans déclaration, pas de mention inventée : l'absence de ligne « Source »
 * est elle-même l'information, pas un oubli de ce test.
 */
test('la liste ne montre rien quand le fichier ne déclare aucune source', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('custom-input').setInputFiles({
    name: 'pdipr-muet.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(pdipr(false), 'utf-8'),
  })

  const liste = page.getByTestId('custom-list')
  await expect(liste).toContainText('Sentier des Monts')
  await expect(liste.getByTestId('custom-source')).toHaveCount(0)
})

/**
 * Et quand le fichier ne déclare rien, on **ne l'invente pas** : on prévient
 * que l'export sera muet. Une attribution fausse serait pire qu'absente.
 */
test('un fichier muet le fait dire, sans rien inventer', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await importer(page, pdipr(false))

  const avertissement = page.getByTestId('detail-source-absente')
  await expect(avertissement).toBeVisible()
  await expect(avertissement).toContainText('ne déclare pas sa source')

  const attente = page.waitForEvent('download')
  await page.getByTestId('itinerary-detail-export').click()
  const gpx = await readFile(await (await attente).path(), 'utf-8')
  expect(gpx).not.toContain('<copyright')
})
