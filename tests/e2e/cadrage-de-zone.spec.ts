import { test, expect, type Page } from '@playwright/test'
import {
  fermerLeGuide,
  mockExternalNetwork,
  waitForMapReady,
} from './helpers.ts'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Issue #578 — choisir une zone cadrait la moitié de la France.
 *
 * Overpass rapporte en entier une relation qui ne fait que traverser la
 * zone : un GR de grande traversée passant par le Pilat arrive avec ses
 * centaines de kilomètres, et cadrer sur ce qui est reçu emportait la zone.
 * Décision de Cédric du 22/10 : on cadre sur l'emprise de la zone
 * administrative.
 *
 * La fixture ordinaire ne peut pas montrer le défaut — tous ses itinéraires
 * tiennent dans le parc. On y ajoute donc une grande traversée qui part du
 * Pilat et file jusqu'en Normandie.
 */
const GRANDE_TRAVERSEE = {
  type: 'relation',
  id: 9_578,
  tags: {
    type: 'route',
    route: 'hiking',
    network: 'nwn',
    ref: 'GR 578',
    name: 'GR 578 — du Pilat à la Manche',
  },
  members: [
    {
      type: 'way',
      ref: 95_780,
      role: '',
      geometry: [
        { lat: 45.4, lon: 4.5 },
        { lat: 46.8, lon: 3.0 },
        { lat: 48.6, lon: 1.0 },
      ],
    },
  ],
}

/** Emprise du PNR du Pilat (relation 5536999), comme embarquée. */
const PILAT = { ouest: 4.3317, sud: 45.2311, est: 4.873, nord: 45.5778 }

interface Cadre {
  ouest: number
  sud: number
  est: number
  nord: number
}

/**
 * Attend que la carte, immobile, contienne tout le parc et s'y serre.
 *
 * Le cadrage est animé : une seule photo peut être prise en vol (§1bis).
 */
async function attendreLaZoneCadree(page: Page): Promise<void> {
  const cadre = () =>
    page.evaluate((): Cadre | null => {
      const map = (
        window as unknown as {
          __sentiersMap?: {
            isMoving: () => boolean
            getBounds: () => {
              getWest: () => number
              getSouth: () => number
              getEast: () => number
              getNorth: () => number
            }
          }
        }
      ).__sentiersMap
      if (!map || map.isMoving()) return null
      const b = map.getBounds()
      return {
        ouest: b.getWest(),
        sud: b.getSouth(),
        est: b.getEast(),
        nord: b.getNorth(),
      }
    })

  await expect
    .poll(
      async () => {
        const c = await cadre()
        if (!c) return 'en vol'
        // Tout le parc est à l'écran…
        const contientLaZone =
          c.ouest <= PILAT.ouest &&
          c.sud <= PILAT.sud &&
          c.est >= PILAT.est &&
          c.nord >= PILAT.nord
        // … et la carte s'y serre : pas plus de 0,6 parc de marge de chaque
        // côté. Plus lâche, la vue de départ de la carte (centre 4,55 / 45,5,
        // zoom 9) passait déjà ce critère avant tout cadrage — mesuré par la
        // revue du sprint 1 : 0,39° de marge à l'ouest, soit 0,72 parc.
        const largeur = PILAT.est - PILAT.ouest
        const hauteur = PILAT.nord - PILAT.sud
        const serre =
          c.ouest >= PILAT.ouest - 0.6 * largeur &&
          c.est <= PILAT.est + 0.6 * largeur &&
          c.sud >= PILAT.sud - 0.6 * hauteur &&
          c.nord <= PILAT.nord + 0.6 * hauteur
        return { contientLaZone, serre }
      },
      { timeout: 15_000 },
    )
    .toEqual({ contientLaZone: true, serre: true })
}

test('choisir une zone cadre la zone, pas la grande traversée qui la touche', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  overpass.setFixture({
    ...pilatFixture,
    elements: [...pilatFixture.elements, GRANDE_TRAVERSEE],
  })
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraires', {
    timeout: 15_000,
  })
  await waitForMapReady(page)

  await attendreLaZoneCadree(page)
})

/**
 * Issue #592 — une zone qui ne rend aucun itinéraire ne recadrait pas : la
 * carte restait sur sa vue de départ, et Zoé lisait « Autour de Nouméa »
 * au-dessus de Saint-Étienne. L'emprise de la zone est connue sans ses
 * itinéraires (#578) : c'est elle qu'on cadre.
 */
test('une zone sans itinéraire est cadrée quand même', async ({ page }) => {
  const overpass = await mockExternalNetwork(page)
  overpass.setFixture({ ...pilatFixture, elements: [] })
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await waitForMapReady(page)

  await attendreLaZoneCadree(page)
})

/**
 * Démonstration du sprint 1, au nom de Paul (téléphone, au doigt) : la zone
 * était cadrée sur toute la hauteur de la carte, et la feuille ouverte à
 * moitié en couvrait le sud — Bourg-Argental et le Crêt de la Perdrix sous
 * le panneau, Lyon au milieu de l'écran. La fiche réservait déjà cette
 * marge (#80) ; le cadrage de zone, non.
 */
test.describe('téléphone (390 px, au doigt)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })

  test('la zone choisie n’est pas cadrée sous la feuille', async ({ page }) => {
    const overpass = await mockExternalNetwork(page)
    overpass.setFixture({
      ...pilatFixture,
      elements: [...pilatFixture.elements, GRANDE_TRAVERSEE],
    })
    await page.goto('/')
    await fermerLeGuide(page)
    await page.getByTestId('zone-pilat').click()
    await page.getByTestId('zone-meta').waitFor({ state: 'attached' })
    await waitForMapReady(page)

    // Le sud et le nord du parc, au milieu de sa largeur : ce qui est peint
    // à leur place doit être la carte, pas la feuille (§1bis).
    const milieu = (PILAT.ouest + PILAT.est) / 2
    const peints = () =>
      page.evaluate(
        ([lon, sud, nord]) => {
          const map = (
            window as unknown as {
              __sentiersMap?: {
                isMoving: () => boolean
                project: (p: [number, number]) => { x: number; y: number }
                getCanvas: () => HTMLCanvasElement
              }
            }
          ).__sentiersMap
          if (!map || map.isMoving()) return null
          const cadre = map.getCanvas().getBoundingClientRect()
          const peint = (lat: number) => {
            const p = map.project([lon, lat])
            return (
              document.elementFromPoint(cadre.x + p.x, cadre.y + p.y) ===
              map.getCanvas()
            )
          }
          return { sud: peint(sud), nord: peint(nord) }
        },
        [milieu, PILAT.sud, PILAT.nord] as const,
      )

    await expect
      .poll(peints, { timeout: 15_000 })
      .toEqual({ sud: true, nord: true })
  })
})
