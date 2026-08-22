import { test, expect } from '@playwright/test'
import {
  mockExternalNetwork,
  mockTilesOk,
  mockElevation,
  buildGpx,
  ouvrirOnglet,
  surChaqueOnglet,
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

  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await ouvrirOnglet(page, 'sorties')
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await ouvrirOnglet(page, 'progression')
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  // Tout déplier : les filtres et le bilan de sortie comptent aussi.
  await page.getByTestId('discovery-filters').locator('summary').click()
  await ouvrirOnglet(page, 'sorties')
  await page.getByTestId('track-toggle-sortie.gpx').click()

  // Les quatre onglets sont parcourus : sans cela l'audit ne verrait qu'un
  // quart de l'application depuis que la navigation est par onglets
  // (issue #171). En disposition accordéons, la boucle tourne une fois.
  const trop_petites: { descriptif: string; w: number; h: number }[] = []
  await surChaqueOnglet(page, async () => {
    trop_petites.push(...(await mesurerCibles(page)))
  })

  expect(trop_petites).toEqual([])
})

/** Relève les cibles tactiles trop petites de la page telle qu'elle est. */
async function mesurerCibles(page: import('@playwright/test').Page) {
  return page.evaluate((minimum) => {
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
}

test('le profil altimétrique répond au doigt, pas seulement à la souris', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.goto('/')

  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await ouvrirOnglet(page, 'progression')
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

  await ouvrirOnglet(page, 'carte')
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

test('rien ne descend sous 13 px sur un écran de téléphone', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')

  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await ouvrirOnglet(page, 'sorties')
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await ouvrirOnglet(page, 'progression')
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  // Les quatre onglets, pour la même raison que l'audit des cibles.
  const textes: { px: number; texte: string; badge: boolean }[] = []
  await surChaqueOnglet(page, async () => {
    textes.push(...(await releverTailles(page)))
  })

  // Deux exceptions assumées, et pas une de plus :
  //  — les badges de réseau (GR, GRP, PR, Boucle) : deux ou trois capitales
  //    grasses sur fond plein, contraintes en largeur dans les listes ;
  //  — l'attribution MapLibre, phrase dense qu'on consulte une fois et qui
  //    occuperait le quart de la carte à 14 px.
  const attribution = (t: string) =>
    /MapLibre|IGN|OpenStreetMap|Métropole/.test(t)
  expect(textes.filter((t) => t.px < 13 && !attribution(t.texte))).toEqual([])
  expect(
    textes.filter((t) => t.px < 14 && !t.badge && !attribution(t.texte)),
  ).toEqual([])
})

/** Relève la taille de chaque élément qui porte lui-même du texte. */
async function releverTailles(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const releve: { px: number; texte: string; badge: boolean }[] = []
    for (const el of document.querySelectorAll('body *')) {
      const propre = el.textContent.trim()
      if (!propre) continue
      // Seuls les éléments qui portent eux-mêmes du texte : sinon on mesure
      // la taille héritée d'un conteneur, pas celle qu'on lit.
      const porteur = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      )
      if (!porteur) continue
      const boite = el.getBoundingClientRect()
      if (boite.width === 0 || boite.height === 0) continue
      releve.push({
        px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
        texte: propre.slice(0, 40),
        badge: /_badge_/.test(el.className),
      })
    }
    return releve
  })
}

/**
 * La carte occupait 40 % de l'écran et le panneau 60 %, par héritage de la
 * disposition bureau (docs/AUDIT_MOBILE.md, constat M1). Sur une application
 * dont la proposition tient en « voir sa progression sur une carte », le
 * rapport était inversé — et il l'était par défaut, pas par décision.
 */
async function hauteurCarteVisible(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page.evaluate(() => {
    const carte = document.querySelector('[data-testid="map"]')
    const feuille = document.querySelector('[data-testid="sidebar"]')
    if (!carte || !feuille) return 0
    const cadre = carte.getBoundingClientRect()
    const dessus = feuille.getBoundingClientRect().top
    return Math.round(Math.min(cadre.bottom, dessus) - cadre.top)
  })
}

test('la carte occupe le cadre, le panneau devient une feuille', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')

  const feuille = page.getByTestId('sidebar')
  // Première visite : rien à voir sur la carte, tout à faire dans le panneau.
  await expect(feuille).toHaveAttribute('data-position', 'moitie')
  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Même feuille ouverte à mi-hauteur, la carte est plus visible qu'avant
  // cette disposition, où elle plafonnait à 338 px sur 844.
  await expect.poll(() => hauteurCarteVisible(page)).toBeGreaterThan(338)

  const poignee = page.getByTestId('sheet-handle')
  await poignee.click()
  await expect(feuille).toHaveAttribute('data-position', 'pleine')
  await poignee.click()
  await expect(feuille).toHaveAttribute('data-position', 'repliee')

  // Repliée, la feuille ne garde que sa poignée : la carte a l'écran. On
  // interroge en boucle — la feuille glisse en 0,2 s, et mesurer pendant la
  // transition ne dit rien de la disposition obtenue.
  await expect
    .poll(async () => {
      const cadre = await page.evaluate(
        () =>
          document.querySelector('[data-testid="map"]')?.getBoundingClientRect()
            .height ?? 1,
      )
      return (await hauteurCarteVisible(page)) / cadre
    })
    .toBeGreaterThan(0.85)

  // La poignée dit le chiffre qu'on est venu chercher.
  await expect(poignee).toContainText('%')

  // Et le bouton « où suis-je » reste atteignable dans les trois positions :
  // ancré en bas, il passait sous la feuille.
  for (const attendu of ['moitie', 'pleine', 'repliee']) {
    await expect(page.getByTestId('locate-toggle')).toBeVisible()
    const couvert = await page.evaluate(() => {
      const bouton = document
        .querySelector('[data-testid="locate-toggle"]')
        ?.getBoundingClientRect()
      const dessus =
        document.querySelector('[data-testid="sidebar"]')?.getBoundingClientRect()
          .top ?? Infinity
      return bouton ? bouton.bottom > dessus : true
    })
    expect(couvert, `position ${attendu}`).toBe(false)
    await poignee.click()
  }
})

test('au retour, la feuille laisse la carte visible', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // On revient sur l'application : la zone est en cache, on vient regarder sa
  // progression sur la carte — pas rouvrir le sélecteur de zone.
  await page.reload()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('sidebar')).toHaveAttribute(
    'data-position',
    'repliee',
  )
})

test('la fiche détail laisse voir le tracé dont elle parle', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.goto('/')

  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await ouvrirOnglet(page, 'progression')
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toContainText('D+', {
    timeout: 10_000,
  })

  // Un point du GR 7 du jeu d'essai. Lire la fiche d'un itinéraire sans voir
  // où il passe n'a pas de sens — et le marqueur posé en parcourant le profil
  // altimétrique se retrouvait sous le panneau avec lui (issue #80).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const carte = (
            window as unknown as {
              __sentiersMap?: {
                project: (c: [number, number]) => { x: number; y: number }
                isMoving: () => boolean
              }
            }
          ).__sentiersMap
          const panneau = document
            .querySelector('[data-testid="itinerary-detail"]')
            ?.getBoundingClientRect()
          if (!carte || !panneau || carte.isMoving()) return null
          return Math.round(panneau.top - carte.project([4.502, 45.4]).y)
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)
})
