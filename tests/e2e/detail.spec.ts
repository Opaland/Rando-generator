import { test, expect } from '@playwright/test'
import {
  mockExternalNetwork,
  mockElevation,
  buildGpx,
  openDetailFromMap,
  hasMap,
  waitForMapReady,
  type MapLike,
} from './helpers.ts'

test('cliquer un tracé sur la carte ouvre la fiche détail (altimétrie + POI)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Un point du GR 7 (way 100 de la fixture Pilat, lat 45.4, lon 4.5–4.505).
  await openDetailFromMap(page, 4.502, 45.4)

  const detail = page.getByTestId('itinerary-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('GR 7')

  // Profil altimétrique : le service mocké répond, les stats D+/D- s'affichent.
  await expect(detail).toContainText('D+', { timeout: 10_000 })

  // Points d'intérêt de la fixture POI.
  const poiList = page.getByTestId('detail-poi-list')
  await expect(poiList).toBeVisible({ timeout: 10_000 })
  await expect(poiList).toContainText('Point de vue sur la vallée')
  await expect(poiList).toContainText('Crêt de la Perdrix')

  // Le refuge est une surface OSM (polygone) : il doit quand même apparaître,
  // avec ses informations pratiques.
  await expect(poiList).toContainText('Refuge du Pilat')
  await expect(poiList).toContainText('32 places')

  // Les couchages libres passent en tête et l'avertissement s'affiche.
  await expect(poiList).toContainText('Cabane des Chèvres')
  // Chaque point dit ce qu'il coûte : sans distance, « à proximité » était
  // une promesse que la requête n'avait jamais vérifiée (issue #122).
  await expect(poiList).toContainText(/\d+ m de détour|\d+,\d+ km de détour/)
  // Et l'ordre suit la distance : le point de vue est sur le tracé, le
  // sommet à plus d'un kilomètre.
  const positions = await poiList.evaluate((liste) =>
    [...liste.querySelectorAll('li')].map((li) => li.textContent),
  )
  const rang = (nom: string) => positions.findIndex((t) => t.includes(nom))
  expect(rang('Point de vue')).toBeLessThan(rang('Crêt de la Perdrix'))

  // Une source n'est pas une fontaine : le silence d'OpenStreetMap sur la
  // potabilité est dit, plutôt que laissé à l'interprétation (issue #123).
  await expect(poiList).toContainText('Source du Vallon')
  await expect(poiList).toContainText('potabilité non renseignée')
  // Et quand la donnée est là, elle est reprise telle quelle.
  await expect(poiList).toContainText('non potable · saisonnière')

  // Le patrimoine ne se limite plus aux monuments : ce qu'on va voir, et ce
  // qui borde le chemin (issue #124).
  await expect(poiList).toContainText('Tour des Sarrasins')
  await expect(poiList).toContainText('Vestige')
  await expect(poiList).toContainText('Croix des Trois Chemins')
  await expect(poiList).toContainText('Croix ou borne')

  // Un profil de montagne se raconte par ses cols : celui-ci est nommé sous
  // la courbe, avec sa distance depuis le départ et son altitude.
  const reperes = page.getByTestId('elevation-reperes')
  await expect(reperes).toContainText('Col de la Croix de Chaubouret')
  await expect(reperes).toContainText('1 201 m')
  await expect(page.getByTestId('detail-poi-caveat')).toContainText(
    /gestionnaire/i,
  )
  // L'abribus de la fixture n'est jamais proposé comme point d'intérêt.
  await expect(poiList).not.toContainText('Arrêt Les Sétoux')

  // La fiche résumé (petite carte) ne s'affiche plus en même temps.
  await expect(page.getByTestId('itinerary-card')).toHaveCount(0)

  // Fermeture.
  await page.getByTestId('itinerary-detail-close').click()
  await expect(detail).toHaveCount(0)
})

test('la vue 3D incline la caméra ; la fermer la remet à plat', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await openDetailFromMap(page, 4.502, 45.4)
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  const pitch = () =>
    page.evaluate(
      () =>
        (window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.getPitch() ??
        0,
    )
  expect(await pitch()).toBe(0)

  await page.getByTestId('detail-3d-toggle').click()
  await expect.poll(pitch, { timeout: 8000 }).toBeGreaterThan(0)

  await page.getByTestId('itinerary-detail-close').click()
  await expect.poll(pitch, { timeout: 8000 }).toBe(0)
})

test('sélectionner un itinéraire depuis la liste zoome dessus sans ouvrir le détail', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // La caméra ne bouge qu'une fois la carte prête : sans cette attente, le
  // test mesure l'absence de mouvement d'une carte qui n'écoute pas encore.
  await waitForMapReady(page)

  const zoomBefore = await page.evaluate(
    () =>
      (window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.getZoom() ??
      0,
  )

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()

  // La fiche résumé s'affiche (pas la fiche détail).
  await expect(page.getByTestId('itinerary-card')).toBeVisible()
  await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.getZoom() ??
            0,
        ),
      { timeout: 15_000 },
    )
    .not.toBe(zoomBefore)
})

test('une trace importée met bien la fiche détail à 100 % (altimétrie indisponible tolérée)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // Pas de mockElevation ici : le service IGN est coupé par mockTiles
  // (data.geopf.fr/**) — la fiche doit rester utilisable sans relief.
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  await openDetailFromMap(page, 4.502, 45.4)
  const detail = page.getByTestId('itinerary-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('100 %')
  // Message d'indisponibilité du relief, sans jamais bloquer l'affichage.
  await expect(detail).toContainText(/altimétrique/i, { timeout: 10_000 })
})

test('parcourir le profil altimétrique pose un marqueur sur le tracé', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await openDetailFromMap(page, 4.502, 45.4)
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
  await expect(page.getByTestId('itinerary-detail')).toContainText('D+', {
    timeout: 10_000,
  })

  const readout = page.getByTestId('elevation-readout')
  await expect(readout).toContainText(/parcourez/i)

  // Combien de points le marqueur porte-t-il sur la carte ?
  const marqueurs = () =>
    page.evaluate(() => {
      const map = (
        window as unknown as {
          __sentiersMap?: {
            getSource: (id: string) => { serialize: () => unknown } | undefined
          }
        }
      ).__sentiersMap
      const source = map?.getSource('elevation-hover')
      if (!source) return -1
      const data = (source.serialize() as { data?: { features?: unknown[] } })
        .data
      return data?.features?.length ?? -1
    })

  expect(await marqueurs()).toBe(0)

  // Survol du graphique : la lecture affiche la distance et l'altitude, et
  // un marqueur apparaît sur le tracé — c'est tout l'intérêt du lien.
  await page.getByTestId('elevation-chart').hover()
  await expect(readout).toContainText(/km/)
  await expect(readout).toContainText(/m$/)
  await expect.poll(marqueurs, { timeout: 5_000 }).toBe(1)

  // Le clavier fait la même chose que la souris.
  await page.getByTestId('elevation-chart').focus()
  await page.keyboard.press('Home')
  await expect(readout).toContainText('0 km')
  await page.keyboard.press('End')
  await expect(readout).not.toContainText('0 km')
  // Quitter le graphique efface le curseur — et le marqueur avec lui.
  await page.keyboard.press('Tab')
  await expect(readout).toContainText(/parcourez/i)
  await expect.poll(marqueurs, { timeout: 5_000 }).toBe(0)
})

test('le repère posé sur le profil reste quand on regarde la carte', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toContainText('D+', {
    timeout: 10_000,
  })

  await page.getByTestId('elevation-chart').click()
  await expect(page.getByTestId('elevation-readout')).toContainText('km')

  // Le geste qui suit le clic, c'est de regarder la carte — donc de sortir
  // du graphique. Le repère disparaissait à cet instant précis : on cliquait,
  // on tournait la tête, il n'y avait rien.
  await page.mouse.move(10, 10)
  await expect(page.getByTestId('elevation-readout')).toContainText('km')

  // Et le marqueur est bien posé sur la carte, pas seulement dans le texte.
  const marqueurs = await page.evaluate(() => {
    const source = (
      window as unknown as {
        __sentiersMap?: {
          getSource: (id: string) => { serialize: () => unknown } | undefined
        }
      }
    ).__sentiersMap?.getSource('elevation-hover')
    if (!source) return -1
    const data = (source.serialize() as { data?: { features?: unknown[] } }).data
    return data?.features?.length ?? -1
  })
  expect(marqueurs).toBe(1)
})
