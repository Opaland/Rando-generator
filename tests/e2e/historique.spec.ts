import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

test('les sorties datées alimentent un historique et un graphique mensuel', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Rien à montrer tant qu'aucune trace n'est importée.
  await expect(page.getByTestId('history-totals')).toHaveCount(0)

  await page.getByTestId('gpx-input').setInputFiles([
    {
      name: 'mars.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(15, '2026-03-08T09:00:00Z'), 'utf-8'),
    },
    {
      name: 'mai.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(40, '2026-05-12T09:00:00Z'), 'utf-8'),
    },
  ])

  const totaux = page.getByTestId('history-totals')
  await expect(totaux).toContainText('2 sorties')
  await expect(totaux).toContainText('km')

  // Mars, avril (vide) et mai : le mois sans sortie est conservé.
  const chart = page.getByTestId('history-chart')
  await expect(chart).toBeVisible()
  await expect(chart.locator('rect')).toHaveCount(3)
  await expect(chart).toContainText(/mars/i)
  await expect(chart).toContainText(/mai/i)

  // L'historique survit au rechargement, comme les traces.
  await page.reload()
  await expect(page.getByTestId('history-totals')).toContainText('2 sorties')
})

test('une trace sans date est comptée sans fausser le graphique', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const sansDate = buildGpx(15).replace(
    /<metadata>.*<\/metadata>/,
    '<metadata></metadata>',
  )
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sans-date.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(sansDate, 'utf-8'),
  })

  await expect(page.getByTestId('history-totals')).toContainText('1 sortie')
  // Elle est signalée comme absente du graphique plutôt que silencieusement
  // rangée dans un mois arbitraire.
  await expect(page.getByTestId('history')).toContainText(/sans date/i)
})

test('« Mes sorties » dit le plus long enchaînement d’un seul tenant', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  // Le pourcentage dit combien ; celui-ci dit si c'était d'affilée.
  const enchainement = page.getByTestId('history-run')
  await expect(enchainement).toContainText('km')
  await expect(enchainement).toContainText(/tronçons? qui se suiv/)
})
