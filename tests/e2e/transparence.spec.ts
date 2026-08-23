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
  // Depuis #152, l'application relève une position toutes les quelques
  // secondes pendant une sortie et l'écrit en base. C'est la donnée la plus
  // sensible qu'elle manipule : la promesse doit la nommer, sans quoi elle
  // ne porte que sur ce qui existait avant.
  await expect(local).toContainText(/enregistr/i)
  await expect(local).toContainText(/position/i)
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

/**
 * CLAUDE.md §3 — une correction de texte se fait sur **toutes** les
 * surfaces, et on cherche la formule, pas le fichier. L'issue #168 en avait
 * corrigé trois et oublié le README, la première chose que lit quelqu'un
 * qui arrive sur le dépôt.
 *
 * Ici la formule est neuve plutôt que fausse : l'application sait
 * enregistrer une sortie depuis cette nuit, et les surfaces publiques
 * décrivaient encore un produit qui ne savait que lire des fichiers.
 */
test('les surfaces publiques disent que Sentiers enregistre une sortie', async ({
  page,
}) => {
  await mockExternalNetwork(page)

  await page.goto('/pourquoi.html')
  await expect(page.locator('body')).toContainText(/enregistrez votre sortie/i)

  await page.goto('/')
  await expect(page.getByTestId('onboarding')).toContainText(
    /enregistrez votre sortie/i,
  )
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
