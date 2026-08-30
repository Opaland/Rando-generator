import { test, expect } from '@playwright/test'
import { cocher, mockExternalNetwork } from './helpers.ts'

/**
 * Les grands itinéraires ne s'imposent plus (issue #322).
 *
 * Cédric, le 25/08 : « pour les GR, les cacher par défaut, ils nuisent à la
 * lecture », et sur les trois surfaces. Ce fichier en garde deux — la liste
 * et la carte — et surtout **le fait qu'elles répondent la même chose**.
 *
 * C'est le vrai risque du repli. Rendre le GR à la liste sans le rendre à la
 * carte donne une ligne cliquable dont le tracé n'apparaît nulle part : un
 * défaut qu'on ne comprend qu'après avoir cherché dix minutes, et qu'aucun
 * test regardant une seule surface ne peut voir.
 */

/** Les réseaux peints à cet instant — éventuellement aucun. */
async function lireLesReseaux(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const carte = (
      window as unknown as {
        __sentiersMap?: {
          querySourceFeatures: (
            id: string,
          ) => { properties?: Record<string, string> }[]
        }
      }
    ).__sentiersMap
    if (!carte) return []
    return [
      ...new Set(
        carte
          .querySourceFeatures('trails')
          .map((f) => f.properties?.['network'] ?? ''),
      ),
    ]
  })
}

/**
 * Les réseaux peints, **une fois la carte prête**.
 *
 * La distinction est le test. `querySourceFeatures` ne rend que ce qui est
 * dans les tuiles déjà analysées : tant que la carte n'a pas fini de
 * dessiner, elle rend un tableau vide — et un tableau vide « ne contient pas
 * GR », ce qui ferait passer l'assertion du premier écran **pour la mauvaise
 * raison** (§1bis).
 *
 * Mesuré en remettant le défaut — la carte qui ignore le filtre : le fichier
 * entier rendait `[]` là où le test seul rendait les trois réseaux. La photo
 * était prise pendant que la carte se peignait, et la charge de la suite est
 * ce qui ouvre la fenêtre (§6ter). On attend donc **d'abord** que la source
 * soit peuplée, et on n'affirme qu'ensuite.
 */
async function reseauxDessines(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  await expect
    .poll(async () => (await lireLesReseaux(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  return lireLesReseaux(page)
}

async function chargerLePilat(page: import('@playwright/test').Page) {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
}

test('au premier écran, le GR n’est ni dans la liste ni sur la carte', async ({
  page,
}) => {
  await chargerLePilat(page)

  // La liste : le GR 7 de la fixture n'y est pas.
  await expect(page.getByTestId('itinerary-list')).not.toContainText('GR 7')

  /*
    La carte : `expect.poll` et non une mesure unique. La source se remplit
    après le rendu, et une photo prise trop tôt trouverait un tableau vide —
    elle passerait donc *pour la mauvaise raison*, ce que le §1bis proscrit.
    La convergence exige que la source soit peuplée **et** sans GR.
  */
  const peints = await reseauxDessines(page)
  expect(peints).toContain('PR')
  expect(peints).not.toContain('GR')
})

test('la zone continue de compter tous ses itinéraires', async ({ page }) => {
  /*
    Replier change ce qu'on voit, jamais ce qui est mesuré. Le compteur de
    zone, le tableau de bord et le matching portent sur tout ce qui est
    chargé — sans quoi la progression d'une personne baisserait parce qu'elle
    a décoché une case.
  */
  await chargerLePilat(page)
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires')
})

test('ce qui est masqué est annoncé, et se rend d’un clic', async ({
  page,
}) => {
  await chargerLePilat(page)

  const annonce = page.getByTestId('list-masques')
  await expect(annonce).toContainText('1 GR')
  await expect(annonce).toContainText('masqué')

  await annonce.getByRole('button', { name: /tout afficher/i }).click()

  // La liste **et** la carte, ensemble : c'est tout l'objet de ce fichier.
  await expect(page.getByTestId('itinerary-list')).toContainText('GR 7')
  await expect
    .poll(async () => (await lireLesReseaux(page)).includes('GR'), {
      timeout: 15_000,
    })
    .toBe(true)

  // Et l'annonce disparaît : plus rien n'est masqué.
  await expect(page.getByTestId('list-masques')).toHaveCount(0)
})

test('la case du réseau rend le GR aux deux surfaces', async ({ page }) => {
  await chargerLePilat(page)

  /*
    La case est désignée par son nom, pas par sa position. Elle l'était par
    `.first()` — ce qui a marché tant que `GR` ouvrait la liste, et a cessé
    le jour où un réseau plus structurant est passé devant (#335). Le test
    ne rougissait pas parce qu'il visait autre chose : il rougissait parce
    qu'il visait *une place*, ce que le §1bis proscrit.
  */
  await cocher(
    page
      .getByRole('group', { name: 'Filtrer par réseau' })
      .getByRole('checkbox', { name: 'GR', exact: true }),
  )

  await expect(page.getByTestId('itinerary-list')).toContainText('GR 7')
  await expect
    .poll(async () => (await lireLesReseaux(page)).includes('GR'), {
      timeout: 15_000,
    })
    .toBe(true)
})
