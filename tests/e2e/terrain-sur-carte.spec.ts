import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from './helpers.ts'

/**
 * Le terrain sur la carte (demande de Cédric, 24/08).
 *
 * > « il faudrait également avoir la couleur du terrain sur la carte »
 *
 * Le revêtement n'existait que dans le profil altimétrique — c'est-à-dire
 * seulement quand on ouvre une fiche, et seulement en regardant ailleurs que
 * la carte. Ce qu'on a sous les pieds se décide pourtant en regardant où
 * l'on va.
 *
 * Ce fichier garde trois choses : la bande existe, elle porte les couleurs
 * du code du terrain et non celles du balisage, et elle **disparaît** quand
 * on ferme la fiche.
 */
test.use({ viewport: { width: 1280, height: 800 } })

async function ouvrirLaFiche(page: import('@playwright/test').Page) {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible({
    timeout: 15_000,
  })
}

/** Ce que la source du terrain contient, vu depuis la carte. */
async function bandes(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const carte = (
      window as unknown as {
        __sentiersMap?: {
          querySourceFeatures: (
            id: string,
          ) => { properties?: Record<string, unknown> }[]
        }
      }
    ).__sentiersMap
    if (!carte) return null
    return carte
      .querySourceFeatures('trails-revetement')
      .map((f) => f.properties ?? {})
  })
}

test('le tracé regardé porte la couleur de son sol', async ({ page }) => {
  await ouvrirLaFiche(page)

  const trouvees = await expect
    .poll(async () => (await bandes(page))?.length ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0)
    .then(() => bandes(page))

  expect(trouvees).not.toBeNull()
  const familles = new Set((trouvees ?? []).map((p) => p['famille']))
  // Le jeu d'essai porte au moins un revêtement exploitable ; sans cela le
  // test passerait sur une source vide en croyant vérifier quelque chose.
  expect(familles.size).toBeGreaterThan(0)
  expect(familles).not.toContain('inconnu')
})

/**
 * La collision que ce lot corrige : « stabilisé » valait exactement le jaune
 * des PR et « naturel » le bleu-vert des boucles locales. Sur la carte, un
 * liseré jaune le long d'un GR se lit comme un PR qui le longe.
 */
test('la bande n’emprunte aucune couleur de balisage', async ({ page }) => {
  await ouvrirLaFiche(page)
  await expect
    .poll(async () => (await bandes(page))?.length ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0)

  const couleurs = new Set(
    ((await bandes(page)) ?? []).map((p) => String(p['couleur']).toLowerCase()),
  )
  // Les cinq couleurs de balisage et le bleu de position, écrites ici parce
  // que les tests de bout en bout et l'application sont deux projets
  // séparés — `tests/unit/terrainCouleurs.test.ts` compare les deux listes.
  for (const prise of [
    '#c8102e',
    '#b34a08',
    '#d9a400',
    '#1d7a8c',
    '#1e2b23',
    '#1d6fa5',
  ]) {
    expect([...couleurs]).not.toContain(prise)
  }
})

/**
 * Une couche qui garde ses données après la fermeture peint le terrain d'un
 * itinéraire qu'on ne regarde plus — et rien ne le dirait, puisque la bande
 * ressemble à ce qu'elle est censée être.
 */
test('la bande s’efface quand on ferme la fiche', async ({ page }) => {
  await ouvrirLaFiche(page)
  await expect
    .poll(async () => (await bandes(page))?.length ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0)

  await page.getByTestId('itinerary-detail-close').click()
  await expect
    .poll(async () => (await bandes(page))?.length ?? 0, { timeout: 10_000 })
    .toBe(0)
})
