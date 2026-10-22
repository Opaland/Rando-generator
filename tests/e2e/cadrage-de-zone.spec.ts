import { test, expect } from '@playwright/test'
import { mockExternalNetwork, waitForMapReady } from './helpers.ts'
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

  // Le cadrage est animé : une seule photo peut être prise en vol (§1bis).
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
        // … et la carte ne s'étend pas à plus d'un parc de marge : le bout
        // normand de la traversée (1,0° E, 48,6° N) en est loin dehors.
        const largeur = PILAT.est - PILAT.ouest
        const hauteur = PILAT.nord - PILAT.sud
        const serre =
          c.ouest >= PILAT.ouest - 2 * largeur &&
          c.est <= PILAT.est + 2 * largeur &&
          c.sud >= PILAT.sud - 2 * hauteur &&
          c.nord <= PILAT.nord + 2 * hauteur
        return { contientLaZone, serre }
      },
      { timeout: 15_000 },
    )
    .toEqual({ contientLaZone: true, serre: true })
})
