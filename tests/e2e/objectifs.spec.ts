import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Une sortie qui ne fait *que la première moitié* du GR 7 de la fixture
 * (lon 4,50 → 4,53). Avec la trace complète, il ne resterait rien à montrer.
 */
function gpxMoitie(): string {
  const lat = 45.4 + 15 / 111_195
  const points: string[] = []
  for (let lon = 4.5; lon <= 4.5151; lon += 0.0002) {
    points.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(4)}"></trkpt>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>${points.join('\n')}</trkseg></trk>
</gpx>`
}

/** La fixture Pilat privée de sa relation GR 7 (id 1001). */
function sansGr7(): unknown {
  const data = pilatFixture as { elements: { id: number }[] }
  return { ...data, elements: data.elements.filter((e) => e.id !== 1001) }
}

/**
 * Mode « objectif » (issue #13).
 *
 * Le tableau de bord constate ; il ne motive pas. Épingler un itinéraire,
 * c'est répondre à la question qui reste après le pourcentage : qu'est-ce
 * qu'il me manque, et où ?
 */
test('épingler un itinéraire montre ce qu’il reste, et y emmène', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  // Une sortie qui ne fait qu'une partie du GR 7 : il reste donc quelque
  // chose à montrer.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'moitie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpxMoitie(), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toBeVisible()

  // Rien tant que rien n'est épinglé : la section ne s'invite pas.
  await expect(page.getByTestId('objectifs')).toHaveCount(0)

  // On épingle depuis la fiche de l'itinéraire : c'est là qu'on voit ce
  // qu'il reste, donc là qu'on décide d'en faire un objectif.
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7 —/ })
    .click()
  await page.getByTestId('itinerary-card-objectif').click()

  const objectifs = page.getByTestId('objectifs')
  await expect(objectifs).toBeVisible()
  await expect(objectifs).toContainText('GR 7')
  // Ce qui reste, en kilomètres, et au moins un tronçon d'un seul tenant.
  await expect(objectifs).toContainText(/à parcourir/)
  await expect(page.getByTestId('troncon-1001-0')).toContainText(/d’un trait/)

  // « Y aller » pose la carte sur le tronçon : l'itinéraire est sélectionné
  // et la carte a bougé.
  await page.getByTestId('troncon-1001-0').click()
  await expect(page.getByTestId('itinerary-card')).toBeVisible()

  // L'objectif survit au rechargement — sinon ce n'est pas un objectif.
  await page.reload()
  await expect(page.getByTestId('objectifs')).toContainText('GR 7', {
    timeout: 15_000,
  })

  // Et se retire.
  await page.getByTestId('objectif-retirer-1001').click()
  await expect(page.getByTestId('objectifs')).toHaveCount(0)
})

test('un objectif épinglé dans une autre zone est dit, pas oublié', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7 —/ })
    .click()
  await page.getByTestId('itinerary-card-objectif').click()
  await expect(page.getByTestId('objectifs-list')).toBeVisible()

  // Une autre zone, où le GR 7 n'est pas : ses tracés ne sont plus chargés.
  // L'objectif n'est pas perdu pour autant — le taire laisserait croire
  // qu'il l'est, et le montrer sans données donnerait « 0 % » à un
  // itinéraire simplement absent.
  overpass.setFixture(sansGr7())
  await page.getByTestId('zone-loire').click()
  await expect(page.getByTestId('objectifs-ailleurs')).toContainText(
    /autre zone/i,
    { timeout: 15_000 },
  )
})
