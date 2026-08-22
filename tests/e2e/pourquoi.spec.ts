import { test, expect } from '@playwright/test'
import {
  fermerLeGuide,
  mockExternalNetwork,
} from './helpers.ts'

/**
 * Page « pourquoi Sentiers » (issue #19).
 *
 * C'est la seule page qui explique ce que le produit fait de différent, et
 * la destination naturelle d'un lien partagé. Elle est donc servie telle
 * quelle : ni bundle, ni JavaScript.
 */
test('la page « pourquoi » s’ouvre depuis l’application et y ramène', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('pourquoi-link').click()
  await expect(page).toHaveURL(/pourquoi\.html$/)

  // Le positionnement, en toutes lettres.
  await expect(page.locator('h1')).toContainText('vos données chez vous')
  await expect(page.locator('body')).toContainText('sentiers balisés')

  // La comparaison est nommée, pas suggérée.
  await expect(page.locator('body')).toContainText('Wandrer')
  await expect(page.locator('body')).toContainText('Visorando')

  // Les refus sont dits ici, pas seulement dans les documents internes.
  await expect(page.locator('body')).toContainText('Pas de compte')
  await expect(page.locator('body')).toContainText('Pas de météo')

  // Et le prix du « tout local » est annoncé, pas caché derrière l'argument.
  // Chaîne et non regex : seule la comparaison par chaîne normalise les
  // espaces, et cette phrase est coupée par un retour à la ligne du HTML.
  await expect(page.locator('body')).toContainText(
    'rien ne suit d’un appareil à l’autre',
  )

  // Deux chemins de retour vers l'application, dont un en bas de page.
  await expect(page.getByRole('link', { name: /Essayer maintenant/ })).toBeVisible()
  await page.getByRole('link', { name: /Ouvrir l’application/ }).click()
  await expect(page.getByTestId('map')).toBeVisible()
})

test('sur téléphone, le lien descend dans le pied plutôt que de manger la carte', async ({
  page,
}) => {
  // L'en-tête est une ressource rare sur téléphone : mesuré, ce lien y
  // coûtait 50 px de hauteur de carte. Il reste atteignable, ailleurs.
  await page.setViewportSize({ width: 390, height: 844 })
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)

  await expect(page.getByTestId('pourquoi-link')).toBeHidden()
  const pied = page.getByTestId('pourquoi-link-pied')
  await expect(pied).toBeVisible()
  await pied.click()
  await expect(page).toHaveURL(/pourquoi\.html$/)
  await expect(page.locator('h1')).toContainText('vos données chez vous')
})

test('la page « pourquoi » se lit sans JavaScript', async ({ browser }) => {
  // Un lien partagé s'ouvre chez quelqu'un qui n'a rien installé, sur un
  // réseau lent, ou dans un aperçu qui n'exécute rien. Une page marketing
  // qui exige un bundle rate exactement ces visiteurs-là.
  const contexte = await browser.newContext({ javaScriptEnabled: false })
  const onglet = await contexte.newPage()
  await onglet.goto('/pourquoi.html')

  await expect(onglet.locator('h1')).toContainText('vos données chez vous')
  await expect(onglet.locator('body')).toContainText('Wandrer')
  await expect(onglet.getByRole('link', { name: /Essayer maintenant/ })).toBeVisible()
  await contexte.close()
})
