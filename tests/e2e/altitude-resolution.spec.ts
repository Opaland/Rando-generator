import { test, expect } from '@playwright/test'
import { mockExternalNetwork, hasMap, openDetailFromMap } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * Retour utilisateur du 22/08 : « Via Lugdunum, Lyon to Le Puy-en-Velay,
 * km 21.4, l'altitude de 714 m ne correspond pas à l'altitude du point ».
 *
 * Elle ne le pouvait pas. Le profil est plafonné à cent relevés quelle que
 * soit la longueur : sur 200 km, un relevé tous les 2 020 m. Ce qui
 * s'affiche entre deux relevés est la valeur d'une droite tendue au-dessus
 * du relief — une interpolation présentée comme une mesure.
 *
 * Ce qui est gardé ici, c'est la règle entière : **le profil dit sa
 * résolution quand elle est grossière, et se tait quand elle est fine.** Une
 * mise en garde affichée partout ne se lirait plus nulle part, et un test
 * qui ne vérifierait que la moitié bruyante laisserait passer cela.
 */

/** Une relation Overpass d'une longueur choisie, faite de vraie géométrie. */
function itineraireLong(longueurKm: number, nbPoints: number): unknown {
  // Un degré de longitude vaut ~78,7 km à 45,4° de latitude.
  const etendueDegres = longueurKm / 78.7
  const geometry = Array.from({ length: nbPoints }, (_, i) => ({
    lon: 4.5 + (i / (nbPoints - 1)) * etendueDegres,
    lat: 45.4,
  }))
  return {
    elements: [
      {
        type: 'relation',
        id: 900_001,
        tags: {
          route: 'hiking',
          name: `Long de ${String(longueurKm)} km`,
          ref: 'GR 999',
        },
        members: [{ type: 'way', ref: 800_001, role: '', geometry }],
      },
    ],
  }
}

async function altimetrieMockee(page: Page): Promise<void> {
  await page.route('**/altimetrie/**', (route) =>
    route.fulfill({
      json: {
        elevations: Array.from({ length: 100 }, (_, i) => ({
          z: 400 + Math.sin(i / 7) * 300,
        })),
      },
    }),
  )
}

async function ouvrirLeProfil(page: Page): Promise<boolean> {
  await page.goto('/')
  await page.getByTestId('onboarding-fermer').click()
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  if (!(await hasMap(page))) return false
  await openDetailFromMap(page, 4.502, 45.4)
  await expect(page.getByTestId('itinerary-detail')).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('elevation-chart')).toBeVisible({
    timeout: 15_000,
  })
  return true
}

test('un itinéraire de 200 km annonce l’espacement de ses relevés', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await altimetrieMockee(page)
  overpass.setFixture(itineraireLong(200, 600))

  test.skip(!(await ouvrirLeProfil(page)), 'WebGL indisponible')

  const note = page.getByTestId('profil-resolution')
  await expect(note).toBeVisible()
  // Deux kilomètres entre relevés : c'est le chiffre qui explique pourquoi
  // une altitude lue entre deux d'entre eux ne veut rien dire de précis.
  await expect(note).toContainText('2,0 km')
  await expect(note).toContainText(/col/i)
})

test('un itinéraire court annonce ses relevés en mètres, pas en kilomètres', async ({
  page,
}) => {
  /*
    Ce test disait autre chose jusqu'au 25/08 : « un itinéraire de 2 km
    n'annonce rien, ses relevés sont serrés ». Il était vert, et pour une
    raison que personne n'avait voulue.

    Les points de jonction entre deux tronçons étaient **comptés deux fois**
    — la fin de l'un et le début du suivant sont le même point, et
    `itineraryCoords` les concaténait tels quels. Sur le GR 7 du fixture,
    sept points au lieu de cinq : l'espacement calculé tombait à 390 m,
    sous le seuil de 500, et l'avertissement se taisait.

    Le chaînage d'#303 a retiré ces doublons — ils faisaient une marche de
    zéro mètre dans l'échantillonnage et deux relevés d'altitude au même
    endroit. Les cinq relevés restants couvrent 2 342 m, soit **585 m entre
    deux** : l'avertissement est juste, et son silence d'avant ne l'était
    pas.

    Le cas « relevés serrés, donc silence » n'a pas disparu : il vit dans
    `tests/unit/elevation.test.ts`, à sa place, des deux côtés du seuil. Le
    rôle de ce fichier-ci est que la phrase **arrive à l'écran** avec le bon
    ordre de grandeur — ici en mètres, là en kilomètres pour 200 km.
  */
  await mockExternalNetwork(page)
  await altimetrieMockee(page)

  test.skip(!(await ouvrirLeProfil(page)), 'WebGL indisponible')

  const note = page.getByTestId('profil-resolution')
  await expect(note).toBeVisible()
  await expect(note).toContainText(/relevée tous les \d+ m\b/)
  await expect(note).not.toContainText('km')
})
