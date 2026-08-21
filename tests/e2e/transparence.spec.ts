import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Issue #168 — cinq services tiers reçoivent des coordonnées, et nos textes
 * publics laissaient croire le contraire.
 *
 * Ces tests ne vérifient pas une jolie tournure : ils vérifient que chaque
 * destinataire réellement contacté par le code est nommé quelque part que
 * l'utilisateur peut lire. Ajouter un appel réseau sans l'y ajouter doit
 * faire échouer la suite — c'est tout l'intérêt.
 */

const DESTINATAIRES = [
  { nom: 'Overpass', recoit: /zone|ref|rayon/i },
  { nom: 'Géoplateforme IGN', recoit: /tuile/i },
  { nom: 'OpenStreetMap', recoit: /tuile|repli/i },
  { nom: 'Base Adresse Nationale', recoit: /commune|tapez|tapé/i },
  { nom: 'GitHub Pages', recoit: /fichier|héberg/i },
]

test('« À propos » nomme chaque service tiers réellement contacté', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('about-open').click()

  const sortant = page.getByTestId('about-sortant')
  await expect(sortant).toBeVisible()
  for (const { nom } of DESTINATAIRES) {
    await expect(sortant).toContainText(nom)
  }
  // L'altimétrie est le cas le plus intrusif : elle envoie la géométrie de
  // l'itinéraire consulté, y compris un itinéraire que vous avez importé.
  await expect(sortant).toContainText('altimétrie')
  await expect(sortant).toContainText('importé')
})

test('« À propos » distingue ce qui sort de ce qui ne sort jamais', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('about-open').click()

  const local = page.getByTestId('about-local')
  await expect(local).toContainText('traces')
  await expect(local).toContainText('ne quitte')
  // La promesse tenue reste affirmée, sans être étendue à tout le reste.
  await expect(page.getByTestId('about-dialog')).not.toContainText(
    'Aucune ne part nulle part',
  )
})

test('la page publique n’affirme plus que le site ignore votre venue', async ({
  page,
}) => {
  await page.goto('/pourquoi.html')
  const corps = page.locator('body')
  // « Le site ne sait pas que vous êtes venu » était faux : l'IGN voit
  // passer chaque tuile, et l'hébergeur sert la page.
  await expect(corps).not.toContainText('ne sait pas que vous êtes venu')
  await expect(corps).toContainText('Géoplateforme IGN')
  await expect(corps).toContainText('Overpass')
})

test('le premier écran ne promet pas que rien ne part', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  const accueil = page.getByTestId('onboarding')
  // « aucune donnée n'est envoyée » était faux dès le premier écran : les
  // tuiles partent avant même qu'on ait touché à quoi que ce soit.
  await expect(accueil).not.toContainText('aucune donnée n’est envoyée')
  await expect(accueil).toContainText('ne partent nulle part')
  await expect(accueil).toContainText('IGN')
})
