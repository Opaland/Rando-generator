import { test, expect } from '@playwright/test'
import {
  mockExternalNetwork,
  mockTilesOk,
  mockElevation,
  buildGpx,
} from './helpers.ts'

/**
 * Cibles tactiles sur téléphone (docs/AUDIT_MOBILE.md, constat M0).
 *
 * Le critère WCAG 2.2 AA « Target Size (Minimum) » (2.5.8) fixe le plancher
 * à 24 × 24 px. Le test le fige : sans lui, la régression ne serait pas
 * détectée mais re-découverte, comme celle-ci l'a été — six mois après.
 *
 * Le critère prévoit une exception pour les liens en ligne dans une phrase :
 * l'attribution MapLibre en relève, on ne peut pas la grossir sans casser la
 * ligne, et elle n'a pas à l'être.
 */
const MINIMUM = 24

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

test('aucune cible tactile sous 24 px sur un écran de téléphone', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  // Tout déplier : les filtres et le bilan de sortie comptent aussi.
  await page.getByTestId('discovery-filters').locator('summary').click()
  await page.getByTestId('track-toggle-sortie.gpx').click()

  const trop_petites = await page.evaluate((minimum) => {
    const cibles = [
      ...document.querySelectorAll(
        'button, select, summary, input, [role="button"]',
      ),
    ]
    return cibles
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          descriptif:
            el.getAttribute('data-testid') ||
            `${el.tagName.toLowerCase()}: ${el.textContent.trim().slice(0, 30)}`,
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })
      .filter(
        (e) => e.w > 0 && e.h > 0 && (e.w < minimum || e.h < minimum),
      )
  }, MINIMUM)

  expect(trop_petites).toEqual([])
})

test('le profil altimétrique répond au doigt, pas seulement à la souris', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toContainText('D+', {
    timeout: 10_000,
  })

  // La consigne ne parle plus de survol — encore faut-il que le geste
  // qu'elle décrit fonctionne vraiment au doigt.
  const lecture = page.getByTestId('elevation-readout')
  await expect(lecture).toContainText(/parcourez/i)
  await page.getByTestId('elevation-chart').tap()
  await expect(lecture).toContainText('km')

  // Et le repère doit tenir : la fin du contact émet un « pointerleave »
  // qui effaçait la lecture aussitôt posée — un défaut que seul le hasard
  // de l'ordonnancement rendait visible.
  const apres = await lecture.textContent()
  await page.waitForTimeout(400)
  await expect(lecture).toHaveText(apres ?? '')
})

test('la légende et l’attribution ne se recouvrent pas sur téléphone', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')

  // L'état d'accueil s'affiche avant tout chargement : il doit tenir dans la
  // zone carte, sinon sa dernière étape est coupée (constat M5).
  await expect(page.getByTestId('onboarding')).toBeVisible()
  const debordement = await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="onboarding"]')
    const panneau = zone?.firstElementChild
    if (!zone || !panneau) return null
    const dehors = zone.getBoundingClientRect()
    const dedans = panneau.getBoundingClientRect()
    return {
      haut: Math.round(dehors.top - dedans.top),
      bas: Math.round(dedans.bottom - dehors.bottom),
    }
  })
  expect(debordement).not.toBeNull()
  expect(debordement?.haut).toBeLessThanOrEqual(0)
  expect(debordement?.bas).toBeLessThanOrEqual(0)

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('map-legend')).toBeVisible()

  // L'attribution est une obligation ODbL et Licence Ouverte : elle doit
  // rester lisible, donc la légende ne peut pas s'installer par-dessus
  // (constat M7). Les commandes de zoom non plus : le premier essai de
  // correctif étalait la légende jusqu'au bord droit, sur le bouton « + ».
  const chevauchements = await page.evaluate(() => {
    const boite = (selecteur: string) =>
      document.querySelector(selecteur)?.getBoundingClientRect() ?? null
    const legende = boite('[data-testid="map-legend"]')
    const voisins = {
      attribution: boite('.maplibregl-ctrl-attrib'),
      zoom: boite('.maplibregl-ctrl-top-right'),
    }
    if (!legende) return null
    return Object.entries(voisins)
      .filter(([, autre]) => {
        if (!autre) return false
        return !(
          legende.bottom <= autre.top ||
          legende.top >= autre.bottom ||
          legende.right <= autre.left ||
          legende.left >= autre.right
        )
      })
      .map(([nom]) => nom)
  })
  expect(chevauchements).toEqual([])
})
