import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

test('import multi-fichiers puis suppression : le % est recalculé', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Deux fichiers d’un coup : un qui matche (15 m), un très loin des tracés.
  await page.getByTestId('gpx-input').setInputFiles([
    {
      name: 'pilat-15m.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(15), 'utf-8'),
    },
    {
      name: 'ailleurs.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(50_000), 'utf-8'),
    },
  ])

  const list = page.getByTestId('tracks-list')
  await expect(list).toContainText('pilat-15m.gpx')
  await expect(list).toContainText('ailleurs.gpx')
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  // Supprimer la trace qui matche (confirmation à deux temps) → 0 %.
  await page
    .getByRole('button', { name: 'Supprimer la trace pilat-15m.gpx' })
    .click()
  await page
    .getByRole('button', { name: /Confirmer.*pilat-15m\.gpx/ })
    .click()
  await expect(list).not.toContainText('pilat-15m.gpx')
  await expect(page.getByTestId('global-pct')).toHaveText('0 %')

  // La suppression est persistée : après rechargement, une seule trace.
  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText('ailleurs.gpx')
  await expect(page.getByTestId('tracks-list')).not.toContainText(
    'pilat-15m.gpx',
  )
})
