import { test, expect } from '@playwright/test'
import { estAlEcran, mockExternalNetwork } from './helpers.ts'

/**
 * La barre d'onglets sur grand écran (demande de Cédric, 23/08).
 *
 * « pour le menu en bas met le tout le temps même sur PC ». L'issue #171
 * avait posé le contraire — la barre n'existait qu'en dessous de 800 px,
 * au motif que le panneau colonne suffisait au-dessus. C'est ce point-là
 * qui est renversé, et lui seul.
 *
 * Filtrer les sections sur grand écran aussi a été essayé le même jour :
 * une soixantaine de tests de bout en bout perdaient l'accès aux panneaux,
 * ce qui n'est pas un accident de tests mais la mesure de ce qu'on cachait —
 * les trois quarts d'un écran qui a la place de tout montrer. Sur PC,
 * l'onglet est donc un **repère** : il amène à sa première section.
 */
const ORDINATEUR = { width: 1280, height: 800 }

test.use({ viewport: ORDINATEUR })

test('la barre est là, et elle ne cache rien', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await expect(page.getByTestId('barre-onglets')).toBeVisible()

  // L'onglet actif au départ est « Carte ». Si la barre filtrait, « Réglages »
  // et « Mes traces » seraient absents du document — ils sont là.
  await expect(page.getByTestId('settings')).toHaveCount(1)
  await expect(page.getByTestId('gpx-dropzone')).toHaveCount(1)
  await expect(page.getByTestId('zone-section')).toHaveCount(1)
})

test('cliquer un onglet amène à sa section', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await expect(page.getByTestId('zone-section')).toBeVisible()

  // Avant : les réglages sont dans le document, mais tout en bas d'une
  // colonne qui défile — donc pas sous les yeux. C'est cette mesure-là qui
  // rend le test capable d'échouer : `toBeVisible` aurait dit oui des deux
  // côtés du clic (CLAUDE.md §1bis).
  expect(await estAlEcran(page, 'settings')).toBe(false)

  await page.getByTestId('onglet-reglages').click()

  await expect
    .poll(async () => estAlEcran(page, 'settings'), { timeout: 5_000 })
    .toBe(true)
})

test('revenir sur « Carte » ramène en haut de la colonne', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('onglet-reglages').click()
  await expect
    .poll(async () => estAlEcran(page, 'settings'), { timeout: 5_000 })
    .toBe(true)

  await page.getByTestId('onglet-carte').click()
  await expect
    .poll(async () => estAlEcran(page, 'zone-section'), { timeout: 5_000 })
    .toBe(true)
})

/**
 * La barre est en position fixe : sans réserve en bas de colonne, le pied de
 * page finit derrière elle. Ce qui s'y trouve n'est pas décoratif — le lien
 * « Pourquoi Sentiers ? » et la mention des sources, exigée par l'ODbL et la
 * Licence Ouverte.
 *
 * Mesuré par ce qui est **peint**, pas par un rectangle : un élément
 * recouvert par la barre garde un rectangle parfaitement valide, et
 * `toBeVisible` le déclare visible (CLAUDE.md §1bis, constat U4).
 */
test('le pied de la colonne ne passe pas sous la barre', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('pied-panneau').scrollIntoViewIfNeeded()

  await expect
    .poll(async () => estAlEcran(page, 'pied-panneau'), { timeout: 5_000 })
    .toBe(true)
})

/**
 * L'invariant, plutôt que la liste des surfaces qu'il protège.
 *
 * Le premier jet posait la barre **par-dessus** la carte et réservait sa
 * hauteur dans la colonne. Le rappel du guide de démarrage devenait
 * inatteignable — `nav` interceptait le clic — et il n'était pas seul :
 * `RouteDrawer`, la fiche d'itinéraire et le bouton de localisation
 * s'ancrent tous à douze pixels du bas de la carte. Quatre rustines, une par
 * surface, et rien pour la cinquième (CLAUDE.md §4).
 *
 * Ce qui est gardé ici est donc l'invariant : **sur grand écran, la barre
 * commence là où le contenu s'arrête**. Une surface ancrée en bas de carte
 * ajoutée demain est couverte sans qu'on y pense, et un futur retour à un
 * recouvrement rend ce test rouge quelle que soit la façon dont il s'y prend.
 *
 * Sur téléphone c'est l'inverse, et c'est délibéré : la barre recouvre la
 * carte (audit mobile, constat M1) parce que la hauteur y est rare.
 * `maquette-onglets.spec.ts` garde ce cas-là.
 */
test('la barre commence là où le contenu s’arrête', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const barre = await page.getByTestId('barre-onglets').boundingBox()
  const contenu = await page.getByTestId('layout').boundingBox()
  expect(barre).not.toBeNull()
  expect(contenu).not.toBeNull()
  if (!barre || !contenu) return

  expect(
    barre.y,
    'la barre mord sur le contenu : tout ce qui s’ancre en bas de carte passe dessous',
  ).toBeGreaterThanOrEqual(contenu.y + contenu.height)
})
