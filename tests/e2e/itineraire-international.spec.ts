import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Un itinéraire international ne s'annonce plus « réseau non déclaré » (#335).
 *
 * OpenStreetMap emploie quatre niveaux de `network` ; l'application n'en
 * lisait que trois. `iwn` — les chemins de Compostelle, la Via Alpina, les
 * sentiers européens — tombait donc dans le repli par le `ref`, et sans
 * `ref` exploitable ressortait `INCONNU`. La légende annonçait alors
 * « Réseau non déclaré » pour un itinéraire dont OSM déclare le réseau le
 * plus structurant qui soit.
 *
 * Mesuré : deux relations sur cinquante-six dans le Pilat, dont la Via
 * Lugdunum (153 km, sans `ref`) ; deux sur vingt-six dans la zone que
 * l'application propose en premier.
 *
 * Ce fichier éprouve les deux surfaces où ça se voit — la ligne des masqués
 * et la légende de la carte —, parce que la classification seule est déjà
 * gardée par `tests/unit/network.test.ts` : ce qui manquait était la preuve
 * qu'elle arrive jusqu'à l'écran.
 */

/** La fixture du Pilat, son GR 7 requalifié en itinéraire international. */
function pilatInternational(): unknown {
  /*
    Passage par `unknown` : la fixture est typée par son propre littéral
    JSON, dont chaque tag optionnel vaut `undefined` plutôt que d'être
    absent. TypeScript refuse la conversion directe vers `Record<string,
    string>`, et il a raison — c'est bien une réinterprétation, pas un
    sous-typage.
  */
  const data = pilat as unknown as {
    elements: { id: number; tags?: Record<string, string> }[]
  }
  return {
    ...data,
    elements: data.elements.map((element) =>
      element.id === 1001 && element.tags
        ? {
            ...element,
            tags: {
              ...element.tags,
              network: 'iwn',
              name: 'Via Lugdunum',
            },
          }
        : element,
    ),
  }
}

async function chargerLeSecteur(page: import('@playwright/test').Page) {
  const overpass = await mockExternalNetwork(page)
  overpass.setFixture(pilatInternational())
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
}

test('il est replié au premier écran, comme les autres grands itinéraires', async ({
  page,
}) => {
  await chargerLeSecteur(page)

  /*
    Le motif même du repli de #322 était la Via Lugdunum — 153 km, ~330
    points d'intérêt — et elle lui échappait, parce qu'elle ressortait
    `INCONNU` et qu'`INCONNU` n'est pas replié. L'itinéraire cité comme
    raison du repli était le seul que le repli ne repliait pas.
  */
  await expect(page.getByTestId('itinerary-list')).not.toContainText(
    'Via Lugdunum',
  )
  await expect(page.getByTestId('list-masques')).toContainText('1 INTER')
})

test('la légende le nomme, et ne parle plus de réseau non déclaré', async ({
  page,
}) => {
  await chargerLeSecteur(page)
  await afficherTousLesReseaux(page)

  const legende = page.getByTestId('map-legend')
  /*
    Sur la **visibilité** de l'entrée, et non sur le `textContent` de la
    légende : `toContainText` lit ce qui est en `display: none`, et le
    §1bis a déjà mordu là-dessus. Une entrée présente mais masquée ne
    nomme rien à personne.
  */
  await expect(legende.locator('[data-reseau="INTERNATIONAL"]')).toBeVisible()
  await expect(legende.locator('[data-reseau="INCONNU"]')).toHaveCount(0)
})

test('la liste le badge « INTER » une fois rendu', async ({ page }) => {
  await chargerLeSecteur(page)
  await afficherTousLesReseaux(page)

  const ligne = page
    .getByTestId('itinerary-list')
    .locator('li')
    .filter({ hasText: 'Via Lugdunum' })
  await expect(ligne).toContainText('INTER')
})
