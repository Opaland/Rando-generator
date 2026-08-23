import { test, expect, type Page } from '@playwright/test'
import {
  mockExternalNetwork,
  fermerLeGuide,
  installerGeolocalisationPilotee,
  emettrePosition,
  suivisDePosition,
} from './helpers.ts'

/**
 * Issue #152 — Sentiers enregistre une sortie.
 *
 * Le seul problème existentiel du produit, d'après l'audit externe du
 * 20/08 : jusqu'ici, pour voir sa progression, il fallait enregistrer sa
 * sortie dans Strava ou Garmin, l'exporter et l'importer ici. La
 * proposition de valeur dépendait d'un concurrent.
 *
 * Ce fichier suit la boucle entière, du bouton « Démarrer » jusqu'à la
 * trace rangée avec les autres — et le chemin de traverse qui compte
 * autant : l'onglet tué en pleine randonnée.
 */

/** Sur le GR 7 de la fixture Pilat, en montant de dix mètres par pas. */
function pas(n: number) {
  return { lon: 4.505 + n * 0.001, lat: 45.4, altitude: 200 + n * 10 }
}

async function marcher(page: Page, jusqua: number, depuis = 1): Promise<void> {
  for (let n = depuis; n <= jusqua; n++) {
    await emettrePosition(page, pas(n))
  }
}

async function ouvrir(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await installerGeolocalisationPilotee(page)
  await page.goto('/')
  await fermerLeGuide(page)
}

test('enregistrer une sortie, la mettre en pause, la terminer', async ({
  page,
}) => {
  await ouvrir(page)
  const listeDesTraces = page.getByTestId('tracks-list').getByRole('listitem')
  const tracesAvant = await listeDesTraces.count()

  await page.getByTestId('sortie-demarrer').click()
  // Les chiffres apparaissent avant la première position : la sortie a
  // commencé, et l'écran le dit plutôt que de rester vide.
  await expect(page.getByTestId('sortie-chiffres')).toBeVisible()
  await expect(page.getByTestId('sortie-attente')).toBeVisible()

  await marcher(page, 4)
  await expect(page.getByTestId('sortie-attente')).toHaveCount(0)
  await expect(page.getByTestId('sortie-distance')).not.toContainText('0 m')
  // Quatre pas de dix mètres, avec l'hystérésis de l'import : 30 m.
  await expect(page.getByTestId('sortie-denivele')).toHaveText('30 m')

  // La pause fige le chronomètre de marche.
  await page.getByTestId('sortie-pause').click()
  await expect(page.getByTestId('sortie-reprendre')).toBeVisible()
  const dureeALaPause = await page.getByTestId('sortie-duree').textContent()
  await page.waitForTimeout(2_500)
  expect(await page.getByTestId('sortie-duree').textContent()).toBe(
    dureeALaPause,
  )

  // Et une position reçue pendant la pause ne compte pas : le téléphone
  // continue d'émettre pendant qu'on boit un café.
  const distanceALaPause = await page
    .getByTestId('sortie-distance')
    .textContent()
  await emettrePosition(page, pas(40))
  await page.waitForTimeout(200)
  expect(await page.getByTestId('sortie-distance').textContent()).toBe(
    distanceALaPause,
  )

  await page.getByTestId('sortie-terminer').click()

  // La sortie est rangée avec les autres : à partir d'ici, c'est une trace
  // comme une autre — appariée, comptée, exportable.
  await expect(page.getByTestId('sortie-demarrer')).toBeVisible()
  await expect
    .poll(() => listeDesTraces.count(), { timeout: 15_000 })
    .toBe(tracesAvant + 1)
  await expect(listeDesTraces.last()).toContainText('Sortie enregistrée')
})

test('une sortie abandonnée ne laisse aucune trace', async ({ page }) => {
  await ouvrir(page)
  await expect(page.getByTestId('tracks-empty')).toBeVisible()

  await page.getByTestId('sortie-demarrer').click()
  await marcher(page, 3)
  await expect(page.getByTestId('sortie-distance')).not.toContainText('0 m')

  await page.getByTestId('sortie-abandonner').click()
  await expect(page.getByTestId('sortie-demarrer')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByTestId('tracks-empty')).toBeVisible()
})

/**
 * Le cœur de la pierre 2, vu de l'utilisateur. Un rechargement est
 * exactement ce que subit un onglet que le navigateur a récupéré : le
 * tampon est en base, la mémoire a disparu.
 */
test('une sortie interrompue est retrouvée au rechargement, en pause', async ({
  page,
}) => {
  await ouvrir(page)
  await page.getByTestId('sortie-demarrer').click()
  await marcher(page, 4)
  await expect(page.getByTestId('sortie-distance')).not.toContainText('0 m')
  const distanceAvant = await page.getByTestId('sortie-distance').textContent()

  await page.reload()
  await fermerLeGuide(page)

  await expect(page.getByTestId('sortie-reprise')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByTestId('sortie-reprendre')).toBeVisible()
  expect(await page.getByTestId('sortie-distance').textContent()).toBe(
    distanceAvant,
  )

  // Elle se reprend, et ce qui suit s'ajoute à ce qui précède.
  await page.getByTestId('sortie-reprendre').click()
  await expect(page.getByTestId('sortie-pause')).toBeVisible()
  await expect(page.getByTestId('sortie-reprise')).toHaveCount(0)
  await marcher(page, 8, 5)
  await expect(page.getByTestId('sortie-distance')).not.toHaveText(
    distanceAvant ?? '',
  )
})

/**
 * **Un seul suivi de position pour deux usages.** La carte montre où l'on
 * est, l'enregistrement retient par où l'on est passé ; deux
 * `watchPosition` simultanés demanderaient deux fois la position haute
 * précision au système, et sur quatre heures c'est la batterie qui paie.
 *
 * Le corollaire compte autant : arrêter l'affichage de sa position ne doit
 * pas arrêter l'enregistrement.
 */
test('la carte et l’enregistrement se partagent un seul suivi GPS', async ({
  page,
}) => {
  await ouvrir(page)
  expect(await suivisDePosition(page)).toBe(0)

  await page.getByTestId('locate-toggle').click()
  expect(await suivisDePosition(page)).toBe(1)

  await page.getByTestId('sortie-demarrer').click()
  expect(await suivisDePosition(page)).toBe(1)

  // On range la position de la carte ; la sortie continue.
  await page.getByTestId('locate-toggle').click()
  expect(await suivisDePosition(page)).toBe(1)
  await marcher(page, 3)
  await expect(page.getByTestId('sortie-distance')).not.toContainText('0 m')

  // Et c'est la fin de la sortie qui referme le suivi.
  await page.getByTestId('sortie-terminer').click()
  await expect
    .poll(() => suivisDePosition(page), { timeout: 10_000 })
    .toBe(0)
})
