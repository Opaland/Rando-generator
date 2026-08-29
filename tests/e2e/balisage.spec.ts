import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  estAlEcran,
  mockExternalNetwork,
  openDetailFromMap,
} from './helpers.ts'

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
  await afficherTousLesReseaux(page)
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
  await afficherTousLesReseaux(page)
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

/**
 * Et la balise est **dessinée**, pas seulement dite (issue #381).
 *
 * OsmAnd et Waymarked Trails la dessinent ; nous la décrivions. « Rectangle
 * rouge sur fond blanc » est juste, et demande à Anne-Marie de reconstituer
 * mentalement ce qu'elle a sous les yeux depuis quarante ans.
 *
 * ## Ce que ce test mesure, et pourquoi ainsi
 *
 * `estAlEcran` et non `toBeVisible` : un SVG sans dimension, ou peint par un
 * élément voisin, garde un rectangle non vide et passerait (§1bis). La seule
 * question qui vaille est « qu'est-ce qui est peint à cet endroit ».
 *
 * ## Ce qu'il ne mesure pas
 *
 * Le refus. Les balises qu'on ne sait pas dessiner — la coquille, une forme
 * absente, une moitié orpheline — sont éprouvées dans
 * `tests/unit/balisageDessin.test.ts`, sur des chaînes **réelles** relevées
 * le 29/08. La fixture n'en porte qu'une, `red:white:red_bar`, et lui en
 * ajouter une changerait les comptes de six autres tests pour une assertion
 * que l'unitaire fait mieux.
 */
test('la balise est dessinée à côté de sa description', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // Le Sentier des Crêtes porte `red:white:red_bar` dans le fixture.
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /Sentier des Crêtes/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  /*
    L'existence d'abord : `estAlEcran` rend `false` aussi bien pour un
    élément absent que pour un élément recouvert, et les deux ne se
    corrigent pas de la même façon.
  */
  await expect(page.getByTestId('balise-peinte')).toHaveCount(1)
  expect(
    await estAlEcran(page, 'balise-peinte'),
    'la balise existe dans le DOM mais rien ne la peint',
  ).toBe(true)

  /*
    Et la phrase reste. Le dessin l'accompagne — une imprimante noir et
    blanc, un lecteur d'écran et un daltonien ont tous besoin des mots
    (#360). Sans cette assertion, remplacer le texte par l'image passerait.
  */
  await expect(page.getByTestId('detail-balisage')).toContainText(
    /rectangle rouge/i,
  )

  /*
    Le dessin est masqué aux lecteurs d'écran : la phrase dit déjà tout, et
    la répéter ferait entendre la balise deux fois.
  */
  await expect(page.getByTestId('balise-peinte')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
})
