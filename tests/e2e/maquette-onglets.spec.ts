import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Issue #171 — la navigation par onglets, devenue la disposition par défaut.
 *
 * Elle a vécu derrière un drapeau tant que la porte de #177 tenait. Elle est
 * devant depuis que Cédric a tranché de ne pas attendre la session E2.
 *
 * Le premier test garde ce qui reste de cette porte : les accordéons doivent
 * rester atteignables. C'est ce qui permet de conduire E2 malgré tout — un
 * groupe sur l'URL nue, l'autre sur `?maquette=accordeons` — et de revenir
 * en arrière sans réécrire.
 */
const TELEPHONE = { width: 390, height: 844 }

test('les accordéons restent atteignables, pour la session et le retour arrière', async ({
  page,
}) => {
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/?maquette=accordeons')
  await expect(page.getByTestId('barre-onglets')).toHaveCount(0)
  // L'empilement d'origine est bien là, poignée comprise.
  await expect(page.getByTestId('sheet-handle')).toBeVisible()
  await expect(page.getByTestId('zone-pilat')).toBeVisible()
  await expect(page.getByTestId('gpx-dropzone')).toBeVisible()
})

test('par défaut, quatre onglets nommés', async ({ page }) => {
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/')

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
  await page.goto('/')
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
  await page.goto('/')
  await expect(page.getByTestId('barre-onglets')).toBeHidden()
})

test('la feuille s’arrête exactement où la barre commence', async ({ page }) => {
  // Trouvé à la bascule : la réserve était d'abord un `padding-bottom`. Le
  // contenu ne passait plus sous la barre, mais la poignée restait collée
  // en bas de l'écran — donc dessous, et la barre interceptait les clics.
  // Feuille repliée, on ne pouvait plus rouvrir le panneau du tout.
  //
  // L'invariant porte donc sur les bords, pas sur une marge : le bas de la
  // feuille et le haut de la barre se touchent, sans recouvrement.
  await page.setViewportSize(TELEPHONE)
  await mockExternalNetwork(page)
  await page.goto('/')

  const barre = await page.getByTestId('barre-onglets').boundingBox()
  const feuille = await page.getByTestId('sidebar').boundingBox()
  expect(barre).not.toBeNull()
  expect(feuille).not.toBeNull()
  expect(Math.round(feuille!.y + feuille!.height)).toBe(Math.round(barre!.y))

  // Et la poignée est cliquable : c'est ce que le recouvrement empêchait.
  await page.getByTestId('sheet-handle').click()
  await expect(page.getByTestId('sidebar')).not.toHaveAttribute(
    'data-position',
    'repliee',
  )
})
