import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockElevation, mockTiles } from './helpers.ts'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * La liste des points d'intérêt se replie quand elle est longue
 * (issue #322, volet 1).
 *
 * ## Ce que la liste longue enterre
 *
 * Pas le profil altimétrique — il est au-dessus dans la fiche, et l'issue se
 * trompait sur ce point. Ce qu'elle enterre est ce qui la **suit** :
 * l'avertissement sur le couchage libre, celui qui dit qu'un refuge non
 * gardé n'est « ni garanti ouvert ni entretenu ». Sur la Via Lugdunum, trois
 * cents entrées séparent quelqu'un qui prépare une nuit dehors de la phrase
 * qui le concerne le plus.
 *
 * C'est donc ce que ce fichier mesure : **la mise en garde est atteignable**.
 */

/**
 * Trente points étalés sur les deux tracés de la fixture.
 *
 * Le GR 7 court de 4,50 à 4,52 de longitude, le Sentier des Crêtes de 4,52 à
 * 4,53. Une première version les posait tous sur le seul GR 7 : le rayon de
 * détour de #318 en écartait alors vingt-neuf sur la seconde fiche, qui
 * n'avait plus rien à replier — le test se plaignait de la fixture, pas du
 * code. Étalés, les deux fiches ont de quoi replier.
 */
function beaucoupDePois(): unknown {
  const elements = Array.from({ length: 30 }, (_, i) => ({
    type: 'node',
    id: 9_500 + i,
    lat: 45.4,
    lon: 4.5 + i * 0.0012,
    tags:
      i === 0
        ? { tourism: 'wilderness_hut', name: 'Cabane du test' }
        : { amenity: 'drinking_water', name: `Fontaine ${String(i)}` },
  }))
  return { version: 0.6, elements }
}

async function ouvrirLaFicheDuGr(page: import('@playwright/test').Page) {
  await mockTiles(page)
  await mockElevation(page)
  await page.route('**/api/interpreter', (route) => {
    const corps = route.request().postData() ?? ''
    if (corps.includes('drinking_water')) {
      void route.fulfill({ json: beaucoupDePois() })
      return
    }
    void route.fulfill({ json: pilatFixture })
  })
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
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

test('une longue liste de points est repliée, et le reste s’affiche d’un clic', async ({
  page,
}) => {
  await ouvrirLaFicheDuGr(page)

  const liste = page.getByTestId('detail-poi-list')
  await expect(liste.locator('li')).toHaveCount(12, { timeout: 15_000 })

  const bouton = page.getByTestId('poi-deplier')
  await expect(bouton).toContainText('18')

  await bouton.click()
  await expect(liste.locator('li')).toHaveCount(30)
  // Le bouton disparaît : il ne reste rien à déplier.
  await expect(page.getByTestId('poi-deplier')).toHaveCount(0)
})

/**
 * La raison d'être du repli, mesurée plutôt qu'affirmée.
 *
 * `document.elementFromPoint` au centre de la mise en garde, comparé à
 * elle-même : c'est la seule question qui vaille — **qu'est-ce qui est peint
 * ici ?** Un rectangle non vide ne prouverait rien, et `toBeVisible`
 * accepterait un élément écrêté (§1bis).
 */
test('la mise en garde sur le couchage reste atteignable', async ({ page }) => {
  await ouvrirLaFicheDuGr(page)

  const garde = page.getByTestId('detail-poi-caveat')
  await expect(garde).toHaveCount(1, { timeout: 15_000 })
  await garde.scrollIntoViewIfNeeded()

  const peinte = await garde.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const dessus = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    )
    return dessus !== null && el.contains(dessus)
  })
  expect(peinte, 'la mise en garde n’est pas ce qui est peint à sa place').toBe(
    true,
  )
})

/**
 * Le défaut qu'un booléen aurait laissé passer : une fiche dépliée laissant
 * la suivante dépliée. Il ne se voit qu'en ouvrant **deux** fiches d'affilée,
 * et c'est exactement pour cela qu'il est écrit ici.
 */
test('déplier une fiche ne déplie pas la suivante', async ({ page }) => {
  await ouvrirLaFicheDuGr(page)

  await page.getByTestId('poi-deplier').click()
  await expect(page.getByTestId('detail-poi-list').locator('li')).toHaveCount(30)

  await page.getByTestId('itinerary-detail-close').click()
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /Sentier des Crêtes/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  /*
    La seconde fiche est repliée, comme n'importe quelle fiche fraîche.

    Le nombre de points n'est pas le même que sur la première — le rayon de
    détour de #318 n'écarte pas les mêmes — donc on asserte ce qui est en
    cause : douze montrés, et un bouton pour le reste.
  */
  await expect(page.getByTestId('detail-poi-list').locator('li')).toHaveCount(
    12,
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('poi-deplier')).toHaveCount(1)
})
