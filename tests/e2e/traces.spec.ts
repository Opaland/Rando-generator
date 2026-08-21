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

test('une trace déposée à l’ouverture survit au rechargement', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Sans rien attendre : la lecture d'IndexedDB est encore en cours, et c'est
  // exactement le moment où la restauration écrasait la liste. La trace
  // disparaissait alors sans un mot — au rechargement, définitivement.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'des-l-ouverture.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText(
    'des-l-ouverture.gpx',
  )

  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText(
    'des-l-ouverture.gpx',
  )
})

test('un doublon supposé reste importable par la personne (issue #165)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  const memeTrace = Buffer.from(buildGpx(15), 'utf-8')
  await page.getByTestId('gpx-input').setInputFiles([
    { name: 'lundi.gpx', mimeType: 'application/gpx+xml', buffer: memeTrace },
  ])
  await expect(page.getByTestId('tracks-list')).toContainText('lundi.gpx')

  // Même contenu, autre nom : l'empreinte coïncide.
  await page.getByTestId('gpx-input').setInputFiles([
    { name: 'mardi.gpx', mimeType: 'application/gpx+xml', buffer: memeTrace },
  ])

  // Ce n'est pas une erreur de lecture : rien dans le bandeau rouge.
  const doublons = page.getByTestId('gpx-doublons')
  await expect(doublons).toContainText('mardi.gpx')
  await expect(doublons).toContainText('lundi.gpx')
  await expect(page.getByTestId('gpx-errors')).toHaveCount(0)
  await expect(page.getByTestId('tracks-list')).not.toContainText('mardi.gpx')

  // La personne tranche : la sortie n'est pas perdue.
  await doublons.getByRole('button', { name: 'Importer quand même' }).click()
  await expect(page.getByTestId('tracks-list')).toContainText('mardi.gpx')
  await expect(doublons).toHaveCount(0)

  // Et elle est bien enregistrée, pas seulement affichée.
  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText('mardi.gpx')
  await expect(page.getByTestId('tracks-list')).toContainText('lundi.gpx')
})

test('un doublon écarté disparaît sans rien importer', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  const memeTrace = Buffer.from(buildGpx(15), 'utf-8')
  await page.getByTestId('gpx-input').setInputFiles([
    { name: 'lundi.gpx', mimeType: 'application/gpx+xml', buffer: memeTrace },
  ])
  await expect(page.getByTestId('tracks-list')).toContainText('lundi.gpx')
  await page.getByTestId('gpx-input').setInputFiles([
    { name: 'mardi.gpx', mimeType: 'application/gpx+xml', buffer: memeTrace },
  ])

  const doublons = page.getByTestId('gpx-doublons')
  await doublons.getByRole('button', { name: 'Ignorer' }).click()
  await expect(doublons).toHaveCount(0)
  await expect(page.getByTestId('tracks-list')).not.toContainText('mardi.gpx')
})

test('un réimport d’archive s’écarte d’un seul geste (revue sprint 1)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const lot = [15, 40, 70].map((offset, index) => ({
    name: `sortie-${String(index)}.gpx`,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(offset), 'utf-8'),
  }))
  await page.getByTestId('gpx-input').setInputFiles(lot)
  await expect(
    page.getByTestId('tracks-list').getByRole('listitem'),
  ).toHaveCount(3)

  // Le même lot redéposé : trois propositions, et un seul geste pour les
  // écarter — sans quoi une archive Strava en produirait des centaines.
  await page.getByTestId('gpx-input').setInputFiles(lot)
  const doublons = page.getByTestId('gpx-doublons')
  await expect(doublons.getByRole('listitem')).toHaveCount(3)
  await doublons.getByRole('button', { name: 'Tout ignorer' }).click()
  await expect(doublons).toHaveCount(0)
  await expect(
    page.getByTestId('tracks-list').getByRole('listitem'),
  ).toHaveCount(3)
})
