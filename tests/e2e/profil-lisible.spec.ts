import { test, expect } from '@playwright/test'
import {
  fermerLeGuide,
  mockExternalNetwork,
  mockElevation,
  mockTilesOk,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Le profil altimétrique, tel qu'on le regarde (retour de Cédric, 24/08).
 *
 * > « le profil des terrains est coupé à moitié lorsque tu regardes »
 *
 * Deux choses mesurées derrière cette phrase, et aucune ne se voyait en
 * relisant le composant :
 *
 * 1. **le dessin était écrasé.** `viewBox="0 0 320 100"` — rapport 3,2 — rendu
 *    dans une boîte de 343 × 70, rapport 4,9, avec
 *    `preserveAspectRatio="none"`. Trente pour cent de hauteur perdus, et
 *    avec eux le relief : une montée de 300 m et une de 200 m se
 *    ressemblaient ;
 * 2. **la fiche coupait net.** `max-height: min(50vh, 480px)` sur un écran de
 *    800 px donne 400 px de fenêtre pour 2 334 px de contenu, sans scrollbar
 *    visible ni le moindre signe que ça continue. Sur PC, la colonne de
 *    droite était vide en dessous.
 *
 * Ce que ce fichier garde est le rapport et la place, pas des pixels : un
 * futur réglage qui réécrase le dessin rougit, quelle que soit la façon dont
 * il s'y prend.
 */

async function ouvrirLaFiche(page: import('@playwright/test').Page) {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  // Sur téléphone, le guide de premier lancement occupe l'écran et la
  // feuille reste repliée derrière lui (AUDIT_UX U1) : sans le fermer, la
  // liste des zones n'est pas atteignable.
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  /*
    Atteindre la liste, quelle que soit la largeur.

    Sur téléphone, la liste des itinéraires vit sous l'onglet « Progression »
    et la feuille démarre à mi-hauteur : il faut changer d'onglet **et**
    déplier. Sur PC tout est déjà là. Plutôt que de brancher sur la largeur —
    ce qui reviendrait à réécrire la règle de `maquetteOnglets` dans le test —
    on boucle sur l'état voulu en tentant les deux gestes (CLAUDE.md §6ter).
  */
  const liste = page.getByTestId('itinerary-list')
  await expect
    .poll(
      async () => {
        if (await liste.isVisible().catch(() => false)) return true
        const onglet = page.getByTestId('onglet-progression')
        if (await onglet.isVisible().catch(() => false)) {
          await onglet.click().catch(() => undefined)
        }
        const poignee = page.getByTestId('sheet-handle')
        if (await poignee.isVisible().catch(() => false)) {
          await poignee.click().catch(() => undefined)
        }
        return false
      },
      { timeout: 25_000 },
    )
    .toBe(true)
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

test.describe('sur PC', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('le profil n’est pas écrasé', async ({ page }) => {
    await ouvrirLaFiche(page)
    const chart = page.getByTestId('elevation-chart')
    await expect(chart).toBeVisible({ timeout: 15_000 })

    const mesure = await chart.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const vb = (el.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/)
      return {
        rendu: r.width / r.height,
        dessin: Number(vb[2]) / Number(vb[3]),
        hauteur: r.height,
      }
    })

    // Le dessin doit être rendu au rapport où il a été composé. 10 % de
    // tolérance : les arrondis de mise en page, pas un écrasement.
    expect(
      mesure.rendu / mesure.dessin,
      `rendu ${mesure.rendu.toFixed(2)}:1 pour un dessin ${mesure.dessin.toFixed(2)}:1`,
    ).toBeGreaterThan(0.9)
    expect(mesure.rendu / mesure.dessin).toBeLessThan(1.1)
  })

  /**
   * Le panneau prenait 400 px de haut sur un écran de 800 dont la colonne de
   * droite était vide. Ce n'est pas un choix de densité, c'est un plafond
   * hérité du téléphone appliqué là où il n'a pas de sens.
   */
  test('la fiche prend la place disponible', async ({ page }) => {
    await ouvrirLaFiche(page)
    const m = await page.getByTestId('itinerary-detail').evaluate((el) => {
      const r = el.getBoundingClientRect()
      const carte = document.querySelector('[data-testid="layout"]')?.getBoundingClientRect()
      return { hauteur: r.height, cadre: carte?.height ?? 0 }
    })
    expect(m.hauteur / m.cadre).toBeGreaterThan(0.6)
  })

  /**
   * Une fiche qui déborde doit le dire. Sans marque, un texte coupé au ras du
   * bord se lit comme un texte fini — c'est ce qui a fait dire « coupé à
   * moitié » plutôt que « il faut faire défiler ».
   */
  test('une fiche qui déborde le montre', async ({ page }) => {
    await ouvrirLaFiche(page)
    const fiche = page.getByTestId('itinerary-detail')
    const deborde = await fiche.evaluate(
      (el) => el.scrollHeight > el.clientHeight + 4,
    )
    expect(deborde).toBe(true)
    await expect(fiche).toHaveAttribute('data-deborde', 'oui')
  })
})

test.describe('sur téléphone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('le profil n’est pas écrasé non plus', async ({ page }) => {
    await ouvrirLaFiche(page)
    const chart = page.getByTestId('elevation-chart')
    await expect(chart).toBeVisible({ timeout: 15_000 })
    const mesure = await chart.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const vb = (el.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/)
      return { rendu: r.width / r.height, dessin: Number(vb[2]) / Number(vb[3]) }
    })
    expect(mesure.rendu / mesure.dessin).toBeGreaterThan(0.9)
    expect(mesure.rendu / mesure.dessin).toBeLessThan(1.1)
  })
})

/**
 * Rien ne peint par-dessus la fiche.
 *
 * Mesuré le 24/08 sur 1 280 × 800 : le bouton « Ma position » recouvrait la
 * fiche à 60 px du bord droit, effaçant une ligne de texte — et, selon ce
 * qu'on avait fait défiler, le bouton « Emporter cette randonnée » ou la
 * mention de la mesure des revêtements.
 *
 * Ce n'est pas un problème de plan : le bouton **doit** rester au-dessus de
 * la carte, et son palier le dit. C'est un problème de place — deux objets
 * ancrés au même coin. La fiche ne bouge pas ; c'est le bouton qui s'écarte,
 * parce qu'il est le plus petit et qu'il n'a pas de contenu à perdre.
 *
 * Mesuré par ce qui est **peint** : un recouvrement laisse deux rectangles
 * parfaitement valides, et `toBeVisible` dit oui aux deux (CLAUDE.md §1bis).
 */
for (const vue of [
  { nom: 'PC', width: 1280, height: 800 },
  { nom: 'téléphone', width: 390, height: 844 },
]) {
  test.describe(`sur ${vue.nom}, la fiche ouverte`, () => {
    test.use({ viewport: { width: vue.width, height: vue.height } })

    test('n’est recouverte par aucune commande de carte', async ({ page }) => {
      await ouvrirLaFiche(page)
      const fiche = page.getByTestId('itinerary-detail')
      await expect(fiche).toBeVisible()

      const recouvrements = await fiche.evaluate((panneau) => {
        const r = panneau.getBoundingClientRect()
        const trouves: { x: number; y: number; quoi: string }[] = []
        // Un quadrillage sur la fiche : on demande à chaque point qui est
        // peint là. Cinq colonnes, neuf lignes — assez fin pour attraper un
        // bouton de 44 px, assez grossier pour rester rapide.
        for (let i = 1; i <= 5; i++) {
          for (let j = 1; j <= 9; j++) {
            const x = r.x + (r.width * i) / 6
            const y = r.y + (r.height * j) / 10
            const dessus = document.elementFromPoint(x, y)
            if (!dessus) continue
            if (panneau === dessus || panneau.contains(dessus)) continue
            trouves.push({
              x: Math.round(x),
              y: Math.round(y),
              quoi:
                dessus.getAttribute('data-testid') ??
                dessus.closest('[data-testid]')?.getAttribute('data-testid') ??
                dessus.tagName,
            })
          }
        }
        return trouves
      })

      expect(
        recouvrements,
        `peint par-dessus la fiche : ${JSON.stringify(recouvrements)}`,
      ).toEqual([])
    })
  })
}

/**
 * Le cadrage réserve pour la fiche **telle qu'elle sera**.
 *
 * Le cadrage se fait une seule fois, à l'ouverture — recadrer à chaque
 * recalcul reprendrait la carte des mains de l'utilisateur (issue #80). Mais
 * à cet instant la fiche peut être encore courte : le profil altimétrique et
 * les points d'intérêt sont deux appels réseau qui répondent quand ils
 * veulent. Sur une liaison rapide, elle atteint sa hauteur tout de suite et
 * rien ne se voit ; sur une liaison lente, on réserve pour un panneau à
 * moitié rempli, et le tracé passe dessous **une seconde après** qu'on l'ait
 * ouvert.
 *
 * C'est le pire genre de défaut : il ne se produit jamais au moment où l'on
 * regarde, donc il ne se reproduit pas à la main. Ce test le fabrique en
 * retenant l'altimétrie deux secondes — ce qu'une 3G en fond de vallée fait
 * sans qu'on le lui demande.
 */
test.describe('sur téléphone, réseau lent', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('le tracé reste visible quand la fiche se remplit après coup', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await mockTilesOk(page)
    // L'altimétrie traîne : la fiche s'ouvre courte et grandit ensuite.
    await page.route('https://data.geopf.fr/altimetrie/**', async (route) => {
      const url = new URL(route.request().url())
      const lon = (url.searchParams.get('lon') ?? '').split('|')
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      await route.fulfill({
        json: { elevations: lon.map((_, i) => ({ z: 800 + i * 3 })) },
      })
    })
    await page.goto('/')
    await fermerLeGuide(page)
    await ouvrirOnglet(page, 'carte')
    await page.getByTestId('zone-pilat').click()
    await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
      timeout: 15_000,
    })
    await ouvrirOnglet(page, 'progression')
    await page
      .getByTestId('itinerary-list')
      .getByRole('button', { name: /GR 7/ })
      .first()
      .click()
    await page.getByTestId('itinerary-card-detail-link').click()
    // On attend que la fiche ait fini de grandir, puis on regarde où est le
    // tracé — pas l'inverse.
    await expect(page.getByTestId('itinerary-detail')).toContainText('D+', {
      timeout: 20_000,
    })

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const carte = (
              window as unknown as {
                __sentiersMap?: {
                  project: (c: [number, number]) => { y: number }
                  isMoving: () => boolean
                }
              }
            ).__sentiersMap
            const fiche = document
              .querySelector('[data-testid="itinerary-detail"]')
              ?.getBoundingClientRect()
            if (!carte || !fiche || carte.isMoving()) return null
            return Math.round(fiche.top - carte.project([4.502, 45.4]).y)
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0)
  })
})
