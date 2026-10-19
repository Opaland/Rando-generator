import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  buildGpx,
  fermerLeGuide,
  mockExternalNetwork,
} from './helpers.ts'

/**
 * Issue #551 : un double-clic sur une commande dont le second temps
 * apparaît **au même endroit**.
 *
 * Le double-clic est un geste ordinaire — par habitude du bureau, ou d'une
 * main qui tremble — et aucun e2e ne le faisait : chaque test cliquait une
 * fois, attendait, puis cliquait encore. Les deux cas reproduits par la
 * revue du 19/10, deux fois sur deux et quatre fois sur quatre :
 *
 * - « Supprimer » cède sa place à « Confirmer ? », et le second clic
 *   confirme : la trace part sans confirmation ;
 * - « Valider » une déclaration fait apparaître « Retirer cette
 *   déclaration » sous le curseur, et le second clic la retire.
 */

async function chargerLaZone(page: import('@playwright/test').Page) {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
}

test('un double-clic sur « Supprimer » ne supprime pas la trace', async ({
  page,
}) => {
  await chargerLaZone(page)
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'a.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  const liste = page.getByTestId('tracks-list')
  await expect(liste).toContainText('a.gpx')

  await page
    .getByRole('button', { name: 'Supprimer la trace a.gpx' })
    .dblclick()

  // Le double-clic a armé la confirmation, sans la donner.
  await expect(
    page.getByRole('button', { name: 'Confirmer : Supprimer la trace a.gpx' }),
  ).toBeVisible()
  await expect(liste).toContainText('a.gpx')

  // Et rien n'a été effacé en base : la trace revient au rechargement.
  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText('a.gpx')
})

test('un double-clic sur « Valider » déclare l’itinéraire, sans le retirer', async ({
  page,
}) => {
  await chargerLaZone(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  await page.getByTestId('declare-ouvrir').click()
  await page.getByTestId('declare-valider').dblclick()

  await expect(page.getByTestId('declare-etat')).toBeVisible()
  await expect(page.getByTestId('global-declare')).toBeVisible()

  // La déclaration est écrite, pas seulement affichée.
  await page.reload()
  await expect(page.getByTestId('global-declare')).toBeVisible({
    timeout: 15_000,
  })
})
