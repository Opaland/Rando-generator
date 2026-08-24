import { test, expect } from '@playwright/test'
import { mockExternalNetwork, openDetailFromMap } from './helpers.ts'

/**
 * Ce qui est peint sur l'arbre (issue #286).
 *
 * Anne-Marie marche depuis trente ans sur les sentiers du Club Vosgien. Elle
 * ne dit pas « je fais un GR » : elle dit « je prends le rectangle rouge
 * jusqu'au Hohneck ». La forme et la couleur *sont* son système de
 * navigation, et une application qui les tait — ou pire, qui les traduit en
 * « PR jaune » — l'envoie chercher une marque qui n'existe pas.
 *
 * Le fixture porte `osmc:symbol=red:white:red_bar` sur le Sentier des
 * Crêtes : la fiche doit dire « rectangle rouge sur fond blanc ».
 */
test('la fiche dit le balisage réel, pas seulement le réseau', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  /*
    Le chemin **300**, et pas le 200 : celui-ci est partagé avec le GR 7, et
    `NETWORK_PRIORITY` donne au GR la couleur et la fiche d'un tronçon commun.
    Cliquer dessus ouvre donc le GR — ce qui est le comportement voulu, et ce
    qui m'a fait écrire ce test faux du premier coup.
    Way 300 : lon 4,53, de lat 45,40 à 45,41.
  */
  await openDetailFromMap(page, 4.53, 45.405)
  await expect(page.getByTestId('itinerary-detail')).toContainText(
    'Sentier des Crêtes',
  )

  const balisage = page.getByTestId('detail-balisage')
  await expect(balisage).toBeVisible({ timeout: 15_000 })
  await expect(balisage).toContainText('rectangle rouge sur fond blanc')
  // L'organisme qui balise, quand OSM le nomme : c'est lui qu'on appelle
  // quand une marque a disparu.
  await expect(balisage).toContainText('Club Vosgien')
})

/**
 * L'autre moitié de la règle, et la plus importante : **ne rien dire quand
 * on ne sait pas**. Le GR 7 du fixture ne porte pas d'`osmc:symbol`. La
 * ligne doit être absente, et non remplie d'un balisage déduit du réseau —
 * ce serait inventer une marque, exactement ce que #284 vient de retirer
 * ailleurs.
 */
test('aucune ligne de balisage quand OSM n’en décrit pas', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  // Un point du GR 7 (way 100 du fixture, lat 45.4, lon 4.5–4.505).
  await openDetailFromMap(page, 4.502, 45.4)
  await expect(page.getByTestId('itinerary-detail')).toContainText('GR 7')

  await expect(page.getByTestId('detail-balisage')).toHaveCount(0)
})

/** Le massif vosgien est proposé, et nommé (issue #286). */
test('les départements du massif vosgien sont chargeables', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await expect(page.getByText('Massif vosgien, par département')).toBeVisible()
  for (const id of ['vosges', 'haut-rhin', 'bas-rhin']) {
    await expect(page.getByTestId(`zone-${id}`)).toBeEnabled()
  }
})
