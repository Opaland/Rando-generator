import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Issue #171 — prototype de navigation par onglets, et #177 qui interdit de
 * l'industrialiser avant la session E2.
 *
 * Le premier test est le plus important du fichier : il vérifie que
 * l'application **par défaut n'a pas changé**. Un prototype qui déborde sur
 * l'expérience réelle n'est plus un prototype, c'est une livraison qui n'a
 * pas dit son nom.
 */
const TELEPHONE = { width: 390, height: 844 }

test('sans le drapeau, rien ne change', async ({ page }) => {
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/')
  await expect(page.getByTestId('barre-onglets')).toHaveCount(0)
  // Et l'empilement d'origine est bien là : la poignée à trois positions
  // reste la navigation tant que la session n'a pas tranché.
  await expect(page.getByTestId('sheet-handle')).toBeVisible()
})

test('avec le drapeau, quatre onglets nommés apparaissent', async ({ page }) => {
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/?maquette=onglets')

  const barre = page.getByTestId('barre-onglets')
  await expect(barre).toBeVisible()
  for (const libelle of ['Carte', 'Sorties', 'Progression', 'Réglages']) {
    await expect(barre).toContainText(libelle)
  }

  // Cibles tactiles : 44 px, le minimum écrit dans l'issue.
  for (const cle of ['carte', 'sorties', 'progression', 'reglages']) {
    const boite = await page.getByTestId(`onglet-${cle}`).boundingBox()
    expect(boite, `onglet ${cle} sans boîte`).not.toBeNull()
    expect(boite!.height, `hauteur de l’onglet ${cle}`).toBeGreaterThanOrEqual(44)
  }
})

test('chaque onglet montre ses sections, et seulement les siennes', async ({
  page,
}) => {
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/?maquette=onglets')
  // La feuille doit être dépliée pour voir les sections du panneau.
  await page.getByTestId('sheet-handle').click()

  // Carte : le choix de zone, et rien d'autre du panneau.
  await expect(page.getByTestId('zone-pilat')).toBeVisible()
  await expect(page.getByTestId('gpx-dropzone')).toHaveCount(0)

  await page.getByTestId('onglet-sorties').click()
  await expect(page.getByTestId('gpx-dropzone')).toBeVisible()
  await expect(page.getByTestId('zone-pilat')).toHaveCount(0)

  await page.getByTestId('onglet-reglages').click()
  await expect(page.getByTestId('gpx-dropzone')).toHaveCount(0)
})

test('sur grand écran, le prototype rend la main au panneau colonne', async ({
  page,
}) => {
  // L'issue est explicite : au-dessus du point de rupture, le panneau
  // existant reste la bonne réponse.
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockExternalNetwork(page)
  await page.goto('/?maquette=onglets')
  await expect(page.getByTestId('barre-onglets')).toBeHidden()
})

test('la feuille réserve exactement la hauteur de la barre', async ({ page }) => {
  // Trouvé à la revue du sprint 5 : la réserve était écrite « 56px » à la
  // main pour une barre qui en fait 50. Deux nombres séparés dérivent en
  // silence, et le jour où ils se croisent dans le mauvais sens, le dernier
  // contenu de la feuille passe sous la barre sans que rien ne le dise.
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/?maquette=onglets')

  const barre = await page.getByTestId('barre-onglets').boundingBox()
  expect(barre).not.toBeNull()
  const reserve = await page
    .getByTestId('sidebar')
    .evaluate((el) => getComputedStyle(el).paddingBottom)

  expect(Math.round(barre!.height)).toBe(Math.round(parseFloat(reserve)))
})
