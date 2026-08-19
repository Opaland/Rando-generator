import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

test('itinéraire perso : import GPX cible, progression, suppression, persistance', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Premier lancement : le guide d'accueil est affiché.
  await expect(page.getByTestId('onboarding')).toBeVisible()
  await expect(page.getByTestId('onboarding')).toContainText(
    'Choisissez une zone',
  )

  // Importer un GPX comme itinéraire À FAIRE (aucune zone chargée).
  await page.getByTestId('custom-input').setInputFiles({
    name: 'boucle-cartoguide.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(0), 'utf-8'),
  })
  const list = page.getByTestId('custom-list')
  await expect(list).toContainText('boucle-cartoguide')
  await expect(list).toContainText('0 %')
  // Le guide d'accueil disparaît dès qu'il y a des données.
  await expect(page.getByTestId('onboarding')).toHaveCount(0)

  // Importer la même géométrie comme TRACE parcourue → l'itinéraire passe à 100 %.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'ma-sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(30), 'utf-8'),
  })
  await expect(list).toContainText('100 %')

  // La fiche s'ouvre au clic et affiche la progression.
  await list
    .getByRole('button', { name: /boucle-cartoguide/ })
    .filter({ hasNotText: 'Supprimer' })
    .click()
  await expect(page.getByTestId('itinerary-card')).toContainText(
    'boucle-cartoguide',
  )
  await expect(page.getByTestId('itinerary-card-pct')).toHaveText('100 %')

  // Persistance : après rechargement, tout est encore là.
  await page.reload()
  await expect(page.getByTestId('custom-list')).toContainText(
    'boucle-cartoguide',
  )
  await expect(page.getByTestId('custom-list')).toContainText('100 %')

  // Suppression (confirmation à deux temps).
  await page
    .getByRole('button', { name: 'Supprimer l’itinéraire boucle-cartoguide' })
    .click()
  await page
    .getByRole('button', { name: /Confirmer.*boucle-cartoguide/ })
    .click()
  await expect(page.getByTestId('custom-list')).toHaveCount(0)
})

test('double import du même GPX : la trace dupliquée est refusée', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const file = {
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(30), 'utf-8'),
  }
  await page.getByTestId('gpx-input').setInputFiles(file)
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx')

  await page.getByTestId('gpx-input').setInputFiles({
    ...file,
    name: 'sortie-copie.gpx',
  })
  await expect(page.getByTestId('gpx-errors')).toContainText('identique')
  // Une seule trace dans la liste.
  await expect(
    page.getByTestId('tracks-list').getByRole('listitem'),
  ).toHaveCount(1)
})
