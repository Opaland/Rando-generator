import { test, expect } from '@playwright/test'
import { fermerLeGuide, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #158 — « j'ai fait celui-là », sans trace GPX.
 *
 * Ce que ce fichier prouve, et c'est le point délicat de l'issue : cocher un
 * itinéraire à la main **ne déplace pas d'un dixième** le pourcentage mesuré.
 * Tout le produit repose sur « le chiffre est vrai » ; si ce test devient
 * vert par accident, c'est cette promesse-là qui tombe.
 */

async function chargerLaZone(page: import('@playwright/test').Page) {
  // Le guide de premier lancement recouvre les boutons de zone, et au
  // rechargement il est rendu avant qu'IndexedDB ait dit qu'il était déjà
  // fermé : l'aide partagée attend qu'il soit parti (helpers.ts).
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
}

async function ouvrirLaFiche(page: import('@playwright/test').Page) {
  const lien = page.getByTestId('itinerary-card-detail-link')
  if ((await lien.count()) === 0) {
    await page
      .getByTestId('itinerary-list')
      .getByRole('button', { name: /GR 7/ })
      .click()
  }
  await lien.click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
}

test('cocher un itinéraire ne touche pas au pourcentage mesuré', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await chargerLaZone(page)

  const pctGlobal = page.getByTestId('global-pct')
  const avant = await pctGlobal.textContent()

  await ouvrirLaFiche(page)
  await page.getByTestId('declare-ouvrir').click()
  await page.getByTestId('declare-valider').click()

  await expect(page.getByTestId('declare-etat')).toBeVisible()

  // Le chiffre mesuré est resté exactement le même.
  await expect(pctGlobal).toHaveText(avant ?? '')

  /*
    Et le déclaratif s'affiche, à part et en toutes lettres. `toBeVisible`
    plutôt que `toContainText` sur le conteneur : `toContainText` lit aussi
    ce qui est en `display: none` (CLAUDE.md §1bis).
  */
  const mention = page.getByTestId('global-declare')
  await expect(mention).toBeVisible()
  await expect(mention).toContainText('déclarés')
})

test('une déclaration se retire, et ne laisse rien derrière', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await chargerLaZone(page)
  await ouvrirLaFiche(page)

  await page.getByTestId('declare-ouvrir').click()
  await page.getByTestId('declare-valider').click()
  await expect(page.getByTestId('global-declare')).toBeVisible()

  await page.getByTestId('declare-retirer').click()
  await expect(page.getByTestId('declare-ouvrir')).toBeVisible()
  await expect(page.getByTestId('global-declare')).toHaveCount(0)
})

/**
 * Une déclaration survit au rechargement — sans quoi Sylvie recommencerait
 * ses quinze PR à chaque visite, ce qui reviendrait à ne rien avoir fait.
 */
test('une déclaration survit au rechargement', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await chargerLaZone(page)
  await ouvrirLaFiche(page)
  await page.getByTestId('declare-ouvrir').click()
  await page.getByTestId('declare-valider').click()
  await expect(page.getByTestId('declare-etat')).toBeVisible()

  // On attend que la base ait pris l'écriture avant de recharger : la fenêtre
  // entre l'état et IndexedDB est connue et non tranchée (issue #203), et ce
  // test-ci ne porte pas dessus.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const ouverture = indexedDB.open('sentiers')
              ouverture.onerror = () => {
                resolve(-1)
              }
              ouverture.onsuccess = () => {
                const base = ouverture.result
                if (!base.objectStoreNames.contains('parcoursDeclares')) {
                  base.close()
                  resolve(-1)
                  return
                }
                const compte = base
                  .transaction('parcoursDeclares', 'readonly')
                  .objectStore('parcoursDeclares')
                  .count()
                compte.onsuccess = () => {
                  base.close()
                  resolve(compte.result)
                }
                compte.onerror = () => {
                  base.close()
                  resolve(-1)
                }
              }
            }),
        ),
      { timeout: 10_000 },
    )
    .toBe(1)

  await page.reload()
  await fermerLeGuide(page)
  /*
    Pas de nouveau clic sur la zone : au rechargement, l'application relit
    `lastZoneKey` et recharge la zone toute seule — cliquer viserait un
    bouton que la carte a déjà remplacé.
  */
  await expect(page.getByTestId('global-declare')).toBeVisible({
    timeout: 20_000,
  })
})

/**
 * Le figuré distinct sur la carte (issue #158, seconde piste).
 *
 * On ne lit pas un trait discontinu au pixel : le composant carte publie ce
 * qu'il a effectivement remis à MapLibre, et c'est ce témoin qu'on mesure —
 * la même technique que pour la sortie en cours.
 */
test('un itinéraire coché est dessiné à part sur la carte', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await chargerLaZone(page)

  const declares = async () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __sentiersTrailStats?: { declares: number }
          }
        ).__sentiersTrailStats?.declares ?? -1,
    )

  // Rien de coché : rien de dessiné dans cette couche.
  await expect.poll(declares, { timeout: 15_000 }).toBe(0)

  await ouvrirLaFiche(page)
  await page.getByTestId('declare-ouvrir').click()
  await page.getByTestId('declare-valider').click()

  // Les chemins de l'itinéraire coché apparaissent dans leur propre source.
  await expect.poll(declares, { timeout: 15_000 }).toBeGreaterThan(0)

  await page.getByTestId('declare-retirer').click()
  await expect.poll(declares, { timeout: 15_000 }).toBe(0)
})

/**
 * La troisième pierre : le déclaratif dans « Mes sorties », **à part**.
 *
 * Ce que ce test tient : la section apparaît, elle nomme l'itinéraire, elle
 * dit qu'il ne compte pas dans le pourcentage mesuré, et on peut y revenir.
 */
test('les déclarations ont leur section dans « Mes sorties »', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await chargerLaZone(page)
  await ouvrirLaFiche(page)
  await page.getByTestId('declare-ouvrir').click()
  await page.getByTestId('declare-valider').click()
  await expect(page.getByTestId('declare-etat')).toBeVisible()
  await page.getByTestId('itinerary-detail-close').click()

  const section = page.getByTestId('declarations')
  await expect(section).toBeVisible()
  await expect(section).toContainText('GR 7')
  await expect(section).toContainText('Déclarés sans trace (1)')
  await expect(section).toContainText('ne comptent pas dans votre pourcentage')

  // On peut revenir dessus depuis cette liste, en deux temps comme partout.
  await section.getByRole('button', { name: /Retirer la déclaration/ }).click()
  await section.getByRole('button', { name: /Confirmer/ }).click()
  await expect(page.getByTestId('declarations')).toHaveCount(0)
})
