import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  fermerLeGuide,
  mockExternalNetwork,
  mockElevationHorsCouverture,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Ce que la fiche montre quand le service altimétrique répond, mais que le
 * modèle de terrain de l'IGN ne couvre pas la zone (#505 : mesuré le 11/09,
 * `ign_rge_alti_wld` rend `-99999` sur des points en Nouvelle-Calédonie).
 *
 * Avant ce test, ce cas n'était exercé par rien : `mockElevation` renvoie
 * toujours des mètres exploitables, et `ElevationError` ne couvre que
 * l'échec réseau. `stats` (calculé par `statsCumulees`) devient `null` quand
 * aucun point n'a d'altitude, et la section « Profil altimétrique » ne
 * rendait alors ni graphique, ni message — un silence qui se lit comme un
 * chargement resté bloqué, pas comme une absence de donnée. #505 posait
 * l'exigence : « il faudra le dire plutôt que taire ».
 */
test('la fiche dit que le relief est indisponible plutôt que de rester muette', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevationHorsCouverture(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await ouvrirOnglet(page, 'progression')
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible({
    timeout: 15_000,
  })

  await expect(page.getByTestId('elevation-indisponible')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByTestId('elevation-chart')).toHaveCount(0)
})
