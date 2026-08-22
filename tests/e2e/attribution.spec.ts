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

const LARGEURS = [390, 800, 810, 1280]

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

for (const largeur of LARGEURS) {
  test.describe(`à ${String(largeur)} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

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
  })
}
