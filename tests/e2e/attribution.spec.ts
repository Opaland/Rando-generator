import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockTilesOk, fermerLeGuide, hasMap } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * On regarde la carte feuille repliée : c'est l'état dans lequel on la lit.
 * Feuille dépliée, elle recouvre le bas de la carte comme un panneau
 * recouvre ce qu'il y a dessous — ce n'est pas un défaut d'attribution.
 */
async function replierLaFeuille(page: Page): Promise<void> {
  const poignee = page.getByTestId('sheet-handle')
  if (!(await poignee.isVisible().catch(() => false))) return
  const feuille = page.getByTestId('sidebar')
  for (let i = 0; i < 3; i++) {
    if ((await feuille.getAttribute('data-position')) === 'repliee') break
    await poignee.click()
  }
  // `data-position` change tout de suite, la hauteur met 0,2 s à suivre :
  // mesurer sans attendre relève une feuille de 821 px là où elle en fait 52.
  // Le même piège qu'au constat U3, et il ne se voit qu'en mesurant.
  await expect
    .poll(() =>
      feuille.evaluate((e) => Math.round(e.getBoundingClientRect().height)),
    )
    .toBeLessThan(80)
}

/**
 * AUDIT_UX.md, constat U4 — l'attribution OpenStreetMap était recouverte.
 *
 * Mesuré sur 1280 px : la légende occupait x 402 → 804, l'attribution
 * x 603 → 1242. Recouvrement de 201,9 px sur 639,3, soit **32 %**, et sur le
 * **début** du texte — « MapLibre | Fond et itinéraires © les contri… ».
 * `elementFromPoint` y renvoyait la légende, pas l'attribution.
 *
 * Ce n'est pas une gêne esthétique : l'ODbL et la Licence Ouverte de la
 * Métropole de Lyon exigent une attribution visible.
 *
 * Le constat M7 de l'audit mobile avait déjà corrigé cela — **mais sous
 * `max-width: 800px` seulement**. C'est la leçon de l'audit UX : une mesure
 * faite à une seule largeur ne dit rien des autres. Ce test-ci balaie donc
 * les quatre largeurs qui encadrent les paliers de la mise en page.
 */

/**
 * Les quatre largeurs qui encadrent les paliers de la mise en page, avec la
 * hauteur qui va avec.
 *
 * La hauteur n'est pas un détail : c'est elle qui décide si la carte du
 * guide, centrée dans le cadre, touche la mention d'attribution. Mesurer à
 * 900 px de haut sur un téléphone de 390 aurait laissé passer le défaut de
 * la revue du 23/08 — la sonde n'y était rouge que d'un cheveu. 844 px est
 * la hauteur d'un iPhone 12 à 14, et c'est celle de toutes les mesures
 * d'`AUDIT_UX.md`.
 *
 * 360 × 640 est le petit téléphone Android, et il gagne sa place par la
 * mesure : c'est le seul écran de cette liste où réserver **la seule
 * hauteur du bandeau** au lieu de la bande entière — barre d'onglets et
 * poignée comprises — laisse la carte du guide retomber sur la mention.
 * À 390 × 844 la même erreur passe à quatre pixels près, c'est-à-dire
 * qu'elle passe.
 */
const ECRANS = [
  { largeur: 360, hauteur: 640 },
  { largeur: 390, hauteur: 844 },
  { largeur: 800, hauteur: 900 },
  { largeur: 810, hauteur: 900 },
  { largeur: 1280, hauteur: 900 },
]

interface Boite {
  x: number
  y: number
  width: number
  height: number
}

function seChevauchent(a: Boite, b: Boite): boolean {
  return !(
    a.y + a.height <= b.y ||
    a.y >= b.y + b.height ||
    a.x + a.width <= b.x ||
    a.x >= b.x + b.width
  )
}

async function boitesDeLaCarte(page: Page): Promise<Record<string, Boite | null>> {
  return page.evaluate(() => {
    const boite = (selecteur: string) => {
      const e = document.querySelector(selecteur)
      if (!e) return null
      const r = e.getBoundingClientRect()
      return r.width === 0 || r.height === 0
        ? null
        : { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    return {
      attribution: boite('.maplibregl-ctrl-attrib'),
      legende: boite('[data-testid="map-legend"]'),
      zoom: boite('.maplibregl-ctrl-top-right'),
      position: boite('[data-testid="locate-toggle"]'),
    }
  })
}

for (const { largeur, hauteur } of ECRANS) {
  test.describe(`à ${String(largeur)} × ${String(hauteur)} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } })

    test('rien ne recouvre l’attribution', async ({ page }) => {
      await mockExternalNetwork(page)
      await mockTilesOk(page)
      await page.goto('/')
      await fermerLeGuide(page)
      test.skip(!(await hasMap(page)), 'WebGL indisponible')

      await page.getByTestId('zone-pilat').click()
      await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
        timeout: 15_000,
      })
      await expect(page.getByTestId('map-legend')).toBeVisible()
      await replierLaFeuille(page)

      const boites = await boitesDeLaCarte(page)
      const attribution = boites['attribution']
      expect(attribution, 'pas d’attribution sur la carte').not.toBeNull()

      const fautifs = Object.entries(boites)
        .filter(([nom, boite]) => nom !== 'attribution' && boite !== null)
        .filter(([, boite]) => seChevauchent(attribution as Boite, boite as Boite))
        .map(([nom]) => nom)
      expect(fautifs, `à ${String(largeur)} px, ces éléments recouvrent l’attribution`).toEqual([])
    })

    /**
     * Le recouvrement de rectangles ne suffit pas : un élément transparent
     * pourrait passer sans rien cacher, et un élément qui borde sans
     * chevaucher pourrait quand même intercepter le clic. On demande donc au
     * navigateur ce qu'il **peint** au début du texte d'attribution — c'est
     * la mesure qui a établi le défaut.
     */
    test('le début du texte d’attribution est bien peint par l’attribution', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await mockTilesOk(page)
      await page.goto('/')
      await fermerLeGuide(page)
      test.skip(!(await hasMap(page)), 'WebGL indisponible')

      await page.getByTestId('zone-pilat').click()
      await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
        timeout: 15_000,
      })
      await expect(page.getByTestId('map-legend')).toBeVisible()
      await replierLaFeuille(page)

      const auDessus = await page.evaluate(() => {
        const attrib = document.querySelector('.maplibregl-ctrl-attrib-inner')
        if (!attrib) return 'attribution absente'
        const r = attrib.getBoundingClientRect()
        const peint = document.elementFromPoint(r.x + 6, r.y + r.height / 2)
        if (!peint) return 'rien'
        return attrib.contains(peint) || attrib === peint
          ? 'attribution'
          : `${peint.tagName}.${peint.className.slice(0, 40)}`
      })
      expect(auDessus).toBe('attribution')
    })

    /**
     * Le même contrôle **guide ouvert**, c'est-à-dire à la toute première
     * ouverture — l'état que les deux tests ci-dessus ne pouvaient pas voir,
     * puisqu'ils commencent par `fermerLeGuide`.
     *
     * C'est par ce trou qu'un défaut est passé : la correction de U4 a
     * remonté l'attribution au-dessus de la barre d'onglets et de la
     * poignée, donc dans la zone qu'occupe la carte du guide. Mesuré à
     * 390 px, quatre sondes sur cinq le long de la mention renvoyaient la
     * carte du guide (`DIV._card_…`) — **80 % de la mention recouverte**, à
     * la première seconde de la première visite.
     *
     * On sonde sur toute la hauteur de la mention et pas en un seul point :
     * un recouvrement partiel est un recouvrement, et c'est précisément ce
     * qui s'était produit.
     */
    test('guide ouvert, rien ne se pose sur l’attribution', async ({ page }) => {
      await mockExternalNetwork(page)
      await mockTilesOk(page)
      await page.goto('/')
      test.skip(!(await hasMap(page)), 'WebGL indisponible')

      await expect(page.getByTestId('onboarding')).toBeVisible()

      const sondes = await page.evaluate(() => {
        const attrib = document.querySelector('.maplibregl-ctrl-attrib-inner')
        if (!attrib) return null
        const r = attrib.getBoundingClientRect()
        return [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
          const peint = document.elementFromPoint(r.x + 6, r.y + r.height * f)
          const surLAttribution =
            peint !== null && (attrib === peint || attrib.contains(peint))
          return {
            f,
            // `getAttribute` et non `className` : sur un élément SVG, la
            // seconde n'est pas une chaîne, et le message de diagnostic
            // planterait au lieu de dire ce qui recouvre.
            peint: peint
              ? `${peint.tagName}.${(peint.getAttribute('class') ?? '').slice(0, 40)}`
              : 'rien',
            surLAttribution,
          }
        })
      })
      expect(sondes, 'pas d’attribution sur la carte').not.toBeNull()

      const recouvertes = (sondes ?? []).filter((s) => !s.surLAttribution)
      expect(
        recouvertes,
        `à ${String(largeur)} px, guide ouvert, ces sondes ne trouvent pas l’attribution`,
      ).toEqual([])
    })
  })
}
