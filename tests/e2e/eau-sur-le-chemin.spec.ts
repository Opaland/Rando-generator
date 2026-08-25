import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Ce qu'il y a sur le chemin, pour choisir (issue #156).
 *
 * Sylvie débute et randonne au téléphone. « 420 m D+ » ne lui dit rien ;
 * « y a-t-il de l'eau ? » lui dit tout, et c'est la seule information vitale
 * de la liste en juillet.
 *
 * Les POI étaient téléchargés, classés et affichés dans la fiche depuis des
 * semaines — mais seulement une fois l'itinéraire choisi. Ils ne servaient
 * jamais à le choisir.
 */
test('la liste dit où est l’eau, une fois qu’on la lui demande', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('discovery-filters').locator('summary').click()

  const liste = page.getByTestId('itinerary-list')
  // Rien n'est cherché tant que personne ne le demande : c'est une requête
  // Overpass de plus, et #283 a montré ce que coûte une requête que
  // personne n'a demandée.
  await expect(liste).not.toContainText('eau à')

  await page.getByTestId('list-charger-pois').click()
  await expect(liste).toContainText('eau à', { timeout: 15_000 })
})

/**
 * L'essentiel de l'issue, et ce que le test précédent ne garde pas :
 * **l'application n'écrit jamais qu'il n'y a pas d'eau.**
 *
 * Un point d'eau absent d'OpenStreetMap ne veut pas dire qu'il n'y en a pas
 * sur le terrain — il veut dire que personne ne l'a saisi. La liste montre
 * une distance quand elle en a trouvé une, et se tait sinon.
 */
test('elle ne dit jamais qu’il n’y a pas d’eau', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('discovery-filters').locator('summary').click()
  await page.getByTestId('list-charger-pois').click()
  await expect(page.getByTestId('itinerary-list')).toContainText('eau à', {
    timeout: 15_000,
  })

  const panneau = page.getByTestId('itinerary-list')
  for (const formule of ['pas d’eau', 'sans eau', 'aucune eau']) {
    await expect(
      panneau,
      `la liste affirme le terrain à partir d’une absence dans OpenStreetMap : « ${formule} »`,
    ).not.toContainText(formule)
  }
  // Et elle le dit à voix haute, plutôt que de le laisser deviner.
  await expect(page.getByTestId('pois-avertissement')).toContainText(
    /n’est pas un point d’eau absent du terrain/,
  )
})

/**
 * Le palier est choisi par la personne, comme la longueur ou la durée —
 * aucun seuil n'est décidé à sa place (CLAUDE.md §2).
 */
test('le palier de détour filtre la liste', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('discovery-filters').locator('summary').click()
  await page.getByTestId('list-charger-pois').click()

  const liste = page.getByTestId('itinerary-list')
  await expect(liste).toContainText('eau à', { timeout: 15_000 })
  await expect(liste).toContainText('Tour du Pilat')

  await page.getByTestId('list-eau').selectOption('250')

  await expect(liste).toContainText('GR 7')
  await expect(
    liste,
    'un itinéraire sans eau trouvée est resté dans une liste filtrée sur l’eau',
  ).not.toContainText('Tour du Pilat')
})
