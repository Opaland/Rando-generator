import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Audit d'accessibilité automatisé (axe-core, règles WCAG 2 A/AA).
 * Le conteneur MapLibre (canvas + contrôles tiers) est exclu : son contenu
 * n'est pas sous notre contrôle direct.
 */
test('aucune violation a11y sérieuse ou critique sur la vue principale', async ({
  page,
}) => {
  await mockExternalNetwork(page)
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

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.maplibregl-map')
    .analyze()

  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])
})

test('aucune violation a11y sérieuse ou critique dans la page À propos', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('about-open').click()
  await expect(page.getByTestId('about-dialog')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('[data-testid="about-dialog"]')
    .analyze()

  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])
})

test('aucune violation a11y dans les panneaux ajoutés (filtres, fiche, sortie)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
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

  // Tout déplier : filtres de découverte, bilan de la sortie, fiche détail.
  await page.getByTestId('discovery-filters').locator('summary').click()
  await expect(page.getByTestId('list-length')).toBeVisible()
  await page.getByTestId('track-toggle-sortie.gpx').click()
  await expect(page.getByTestId('track-outing')).toBeVisible()
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.maplibregl-map')
    .analyze()

  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(
    serious.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([])
})

/**
 * Le rôle annoncé par la carte doit correspondre à ce qu'elle sait faire.
 * `role="application"` demande au lecteur d'écran de rendre toutes les
 * touches à la page ; il n'a de sens que si la page les gère. Ici les tracés
 * ne s'ouvrent qu'au clic — et la liste latérale mène partout où mène la
 * carte. C'est cette équivalence que le test vérifie : sans elle, changer le
 * rôle retirerait quelque chose.
 */
async function tabJusqua(
  page: import('@playwright/test').Page,
  repere: { testId?: string; texte?: string; dans?: string },
  maximum = 80,
): Promise<number> {
  for (let coups = 1; coups <= maximum; coups += 1) {
    await page.keyboard.press('Tab')
    const atteint = await page.evaluate((cible) => {
      const actif = document.activeElement
      if (!actif) return false
      if (cible.dans !== undefined && !actif.closest(cible.dans)) return false
      if (cible.testId !== undefined) {
        return actif.getAttribute('data-testid') === cible.testId
      }
      return actif.textContent.includes(cible.texte ?? '')
    }, repere)
    if (atteint) return coups
  }
  throw new Error(
    `« ${repere.testId ?? repere.texte ?? ''} » n’est pas atteignable au clavier`,
  )
}

test('la carte s’annonce comme une région, et la liste mène partout où elle mène', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const carte = page.getByTestId('map')
  await expect(carte).toHaveAttribute('role', 'region')
  await expect(carte).toHaveAttribute('aria-label', /carte des itinéraires/i)

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Au clavier seul, sans jamais toucher la carte : sélectionner un
  // itinéraire, puis ouvrir sa fiche — les deux gestes que le clic sur un
  // tracé permet.
  await page.evaluate(() => {
    document.body.focus()
  })
  // Restreint à la liste : « GR 7 » figure aussi parmi les grands
  // itinéraires du sélecteur de zone, et le premier essai chargeait le GR 70.
  await tabJusqua(page, {
    texte: 'GR 7',
    dans: '[data-testid="itinerary-list"]',
  })
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('itinerary-card')).toBeVisible()

  await tabJusqua(page, { testId: 'itinerary-card-detail-link' })
  await page.keyboard.press('Enter')
  const fiche = page.getByTestId('itinerary-detail')
  await expect(fiche).toBeVisible()
  // Les points d'intérêt aussi : sur la carte ils ne s'ouvrent qu'au clic.
  await expect(fiche).toContainText(/point|eau|abri|refuge|aucun/i)
})
