import { test, expect } from '@playwright/test'
import {
  mockExternalNetwork,
  mockElevation,
  fermerLeGuide,
  hasMap,
  ouvrirOnglet,
} from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * AUDIT_UX.md, constat U10 — le sous-titre de la fiche détail se cassait en
 * trois lignes : « GR 7 — / Traversée du / Pilat ». « Incliner la carte »
 * prenait 145 px des 380 de la fiche, et le sous-titre héritait de ce qui
 * restait.
 *
 * Le sous-titre est le seul endroit qui nomme l'itinéraire en toutes
 * lettres. C'est lui qui doit avoir la largeur, pas un bouton.
 *
 * Ce qui est gardé n'est pas « le bouton est en dessous » mais **que le nom
 * de l'itinéraire tienne** : une autre mise en page qui y parvient passera
 * ce test.
 */

async function ouvrirLaFiche(page: Page): Promise<boolean> {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  if (!(await hasMap(page))) return false
  // Par la liste plutôt que par un clic sur la carte : au doigt, la feuille
  // couvre le bas du cadre et le clic tombe dessus. C'est le chemin que
  // `mobile.spec.ts` emprunte déjà pour la même raison.
  await ouvrirOnglet(page, 'progression')
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toContainText('D+', {
    timeout: 10_000,
  })
  return true
}

/**
 * Un nom d'itinéraire réellement long, comme OpenStreetMap en porte.
 *
 * Sans cela, la borne à deux lignes du sous-titre n'était qu'un filet jamais
 * touché : une mutation la portait de 2 à 9 sans faire rougir un test. Le
 * filet existe pour ces noms-là ; il doit donc être éprouvé avec eux.
 */
const NOM_LONG =
  'Chemin de Saint-Jacques-de-Compostelle, voie du Puy, section Le Puy-en-Velay vers Saint-Privat-d’Allier par le plateau du Devès'

function itineraireAuNomLong(): unknown {
  const geometry = Array.from({ length: 40 }, (_, i) => ({
    lon: 4.5 + i * 0.001,
    lat: 45.4,
  }))
  return {
    elements: [
      {
        type: 'relation',
        id: 910_001,
        tags: { route: 'hiking', ref: 'GR 65', name: NOM_LONG },
        members: [{ type: 'way', ref: 810_001, role: '', geometry }],
      },
    ],
  }
}

for (const { nom, viewport } of [
  { nom: 'bureau', viewport: { width: 1280, height: 800 } },
  { nom: 'téléphone', viewport: { width: 390, height: 844 } },
]) {
  test.describe(nom, () => {
    test.use({ viewport })

    test('le nom de l’itinéraire tient sur deux lignes au plus', async ({
      page,
    }) => {
      test.skip(!(await ouvrirLaFiche(page)), 'WebGL indisponible')

      const lignes = await page
        .locator('[data-testid="itinerary-detail"] header p')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element)
          const hauteurLigne = Number.parseFloat(style.lineHeight)
          const hauteur = element.getBoundingClientRect().height
          return Number.isFinite(hauteurLigne)
            ? Math.round(hauteur / hauteurLigne)
            : 1
        })
      expect(lignes, `« ${nom} » : le sous-titre s’étale sur ${String(lignes)} lignes`).toBeLessThanOrEqual(2)
    })

    test('un nom très long est coupé, pas empilé', async ({ page }) => {
      const overpass = await mockExternalNetwork(page)
      await mockElevation(page)
      overpass.setFixture(itineraireAuNomLong())
      await page.goto('/')
      await fermerLeGuide(page)
      await page.getByTestId('zone-pilat').click()
      await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
        timeout: 15_000,
      })
      test.skip(!(await hasMap(page)), 'WebGL indisponible')
      await ouvrirOnglet(page, 'progression')
      await page
        .getByTestId('itinerary-list')
        .getByRole('button', { name: /GR 65/ })
        .click()
      await page.getByTestId('itinerary-card-detail-link').click()
      await expect(page.getByTestId('itinerary-detail')).toBeVisible({
        timeout: 10_000,
      })

      const sub = page.locator('[data-testid="itinerary-detail"] header p').first()
      // Le nom est bien celui qu'on croit — sinon le test mesurerait autre
      // chose et passerait pour rien.
      await expect(sub).toContainText('Saint-Jacques')
      const lignes = await sub.evaluate((element) => {
        const hauteurLigne = Number.parseFloat(getComputedStyle(element).lineHeight)
        return Math.round(element.getBoundingClientRect().height / hauteurLigne)
      })
      expect(lignes, `« ${nom} » : ${String(lignes)} lignes pour un nom long`).toBeLessThanOrEqual(2)
    })

    test('le bouton d’inclinaison ne rogne pas le titre', async ({ page }) => {
      test.skip(!(await ouvrirLaFiche(page)), 'WebGL indisponible')

      const titre = await page
        .locator('[data-testid="itinerary-detail"] header h3')
        .boundingBox()
      const bouton = await page.getByTestId('detail-3d-toggle').boundingBox()
      expect(titre).not.toBeNull()
      expect(bouton).not.toBeNull()
      // Ils ne partagent plus de rangée : le bouton commence sous le titre.
      expect(
        (bouton?.y ?? 0) >= (titre?.y ?? 0) + (titre?.height ?? 0),
        'le bouton d’inclinaison partage encore sa ligne avec le titre',
      ).toBe(true)
    })
  })
}
