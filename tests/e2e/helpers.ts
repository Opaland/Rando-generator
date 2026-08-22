import { expect, type Page } from '@playwright/test'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }
import poiFixture from '../fixtures/overpass/poi.json' with { type: 'json' }

/** Sous-ensemble de l'API MapLibre exposée aux tests via window.__sentiersMap. */
export interface MapLike {
  project: (lngLat: [number, number]) => { x: number; y: number }
  getZoom: () => number
  getCenter: () => { lng: number; lat: number }
  getPitch: () => number
  isMoving: () => boolean
}

/** Vrai si la carte a pu s'initialiser (WebGL disponible dans ce navigateur). */
export async function hasMap(page: Page): Promise<boolean> {
  return page
    .waitForFunction(() => '__sentiersMap' in window, undefined, {
      timeout: 10_000,
    })
    .then(
      () => true,
      () => false,
    )
}

/**
 * Attend que la carte soit prête à bouger.
 *
 * `__sentiersMap` existe dès la construction, bien avant que MapLibre émette
 * `load` — et c'est cet événement qui autorise les cadrages (voir `ready`
 * dans MapView). Sous charge, avec toutes les tuiles avortées par les
 * doublures, l'écart entre les deux se compte en secondes : un test qui
 * attend un mouvement de caméra sans attendre cela mesure une carte qui
 * n'écoute encore personne (issue #111).
 */
export async function waitForMapReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __sentiersMap?: { loaded: () => boolean } })
        .__sentiersMap?.loaded() === true,
    undefined,
    { timeout: 30_000 },
  )
}

/** Clique un point géographique sur la carte (coordonnées carte → écran). */
export async function clickOnMap(
  page: Page,
  lon: number,
  lat: number,
): Promise<void> {
  // Les couches ne répondent aux clics qu'une fois la carte chargée.
  await waitForMapReady(page)
  // La caméra peut encore finir un fitBounds animé : attendre l'arrêt avant
  // de projeter, sinon le point calculé dérive de la ligne (tolérance de
  // clic quasi nulle sur une géométrie « line » de 2 px).
  await page.waitForFunction(
    () =>
      !(window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.isMoving(),
  )
  const mapBox = await page.getByTestId('map').boundingBox()
  if (!mapBox) throw new Error('Carte introuvable')
  const point = await page.evaluate(
    ([lonArg, latArg]) => {
      const map = (window as unknown as { __sentiersMap?: MapLike })
        .__sentiersMap
      if (!map) return null
      return map.project([lonArg, latArg])
    },
    [lon, lat] as const,
  )
  if (!point) throw new Error('Carte non initialisée (WebGL indisponible ?)')
  await page.mouse.click(mapBox.x + point.x, mapBox.y + point.y)
}

/**
 * Ouvre la fiche détail en cliquant un tracé sur la carte.
 *
 * Le clic vise une géométrie de 2 px de large sur un canvas : entre le
 * moment où la caméra s'immobilise et celui où la couche est effectivement
 * rendue, il peut tomber dans le vide — c'était la cause de tests instables
 * (deux navigateurs se partagent le GPU de la machine). On réessaie donc
 * jusqu'à ce que la fiche s'ouvre, au lieu de parier sur un seul clic.
 */
export async function openDetailFromMap(
  page: Page,
  lon: number,
  lat: number,
): Promise<void> {
  await expect(async () => {
    await clickOnMap(page, lon, lat)
    await expect(page.getByTestId('itinerary-detail')).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 25_000, intervals: [300, 700, 1_500, 3_000] })
}

export const MIRROR_1 = 'https://overpass-api.de/api/interpreter'
export const MIRROR_2 = 'https://overpass.kumi.systems/api/interpreter'

/** PNG transparent 1×1, pour servir des tuiles valides sans réseau. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Coupe les serveurs de tuiles : les tests ne touchent jamais le réseau réel. */
export async function mockTiles(page: Page): Promise<void> {
  await page.route('https://data.geopf.fr/**', (route) => route.abort())
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  )
}

/** Sert des tuiles factices valides (pas d'erreur, pas de repli déclenché). */
export async function mockTilesOk(page: Page): Promise<void> {
  const serve = (route: Parameters<Parameters<Page['route']>[1]>[0]) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG })
  await page.route('https://data.geopf.fr/**', serve)
  await page.route('https://tile.openstreetmap.org/**', serve)
}

export interface OverpassMock {
  count: () => number
  /** Remplace la réponse servie aux prochains appels. */
  setFixture: (fixture: unknown) => void
  /** Dernière requête Overpass QL reçue, décodée (hors requête de POI). */
  lastQuery: () => string
}

/**
 * Overpass mocké : répond avec la fixture enregistrée et retourne un compteur
 * d'appels (pour vérifier que le cache évite les requêtes).
 */
export async function mockOverpass(page: Page): Promise<OverpassMock> {
  // Les boucles locales embarquées (public/data) fausseraient les comptages
  // d'itinéraires des tests : servies vides par défaut. Un test qui veut les
  // exercer ré-enregistre sa propre route par-dessus (la plus récente gagne).
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [] } }),
  )
  let calls = 0
  let current: unknown = pilatFixture
  let derniere = ''
  await page.route('**/api/interpreter', (route) => {
    calls += 1
    // La requête de points d'intérêt (core/poi.ts) cible les mêmes miroirs
    // Overpass que celle des itinéraires : on la distingue par son contenu.
    const body = route.request().postData() ?? ''
    if (body.includes('drinking_water')) {
      void route.fulfill({ json: poiFixture })
      return
    }
    // Le corps est un formulaire encodé (`data=…`) : on rend la requête QL
    // telle qu'Overpass la lit, sinon l'assertion porte sur des %5B.
    derniere = new URLSearchParams(body).get('data') ?? body
    void route.fulfill({ json: current })
  })
  return {
    count: () => calls,
    setFixture: (fixture) => {
      current = fixture
    },
    lastQuery: () => derniere,
  }
}

/**
 * Mocke l'API Adresse de la BAN (recherche par nom de lieu, issue #131).
 *
 * La réponse suit le format documenté : un GeoJSON de points, `label` et
 * `context` dans les propriétés. Le service n'est pas joignable depuis
 * l'environnement de test — comme aucun service externe — donc ce mock ne
 * prouve pas le contrat, seulement le comportement de l'application face à
 * une réponse de cette forme.
 */
export async function mockGeocode(
  page: Page,
  options: { vide?: boolean; erreur?: number } = {},
): Promise<void> {
  await page.route('https://api-adresse.data.gouv.fr/search/**', (route) => {
    if (options.erreur) {
      void route.fulfill({ status: options.erreur, body: 'nope' })
      return
    }
    void route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: options.vide
          ? []
          : [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [4.502, 45.4] },
                properties: {
                  label: 'Saint-Étienne',
                  context: '42, Loire, Auvergne-Rhône-Alpes',
                  type: 'municipality',
                },
              },
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [5.4, 45.2] },
                properties: {
                  label: 'Saint-Étienne-de-Saint-Geoirs',
                  context: '38, Isère, Auvergne-Rhône-Alpes',
                  type: 'municipality',
                },
              },
            ],
      },
    })
  })
}

/**
 * Mocke le service altimétrique IGN (data.geopf.fr/altimetrie) avec un profil
 * synthétique croissant. À enregistrer APRÈS mockTiles/mockExternalNetwork :
 * Playwright priorise la route la plus récemment enregistrée.
 */
export async function mockElevation(page: Page): Promise<void> {
  await page.route('https://data.geopf.fr/altimetrie/**', (route) => {
    const url = new URL(route.request().url())
    const lon = (url.searchParams.get('lon') ?? '').split('|')
    const elevations = lon.map((_, i) => ({ z: 800 + i * 3 }))
    void route.fulfill({ json: { elevations } })
  })
}

/** Fixture réduite : seule la relation GR 7 reste (pour tester l'actualisation). */
export function pilatGrOnly(): unknown {
  const data = pilatFixture as { elements: { id: number }[] }
  return { ...data, elements: data.elements.filter((e) => e.id === 1001) }
}

export async function mockExternalNetwork(page: Page): Promise<OverpassMock> {
  await mockTiles(page)
  return mockOverpass(page)
}

/**
 * GPX synthétique : une ligne à latitude constante, décalée de `offsetNorthMeters`
 * au nord du tracé GR de la fixture Overpass (lat 45.4, lon 4.50 → 4.53).
 */
export function buildGpx(
  offsetNorthMeters: number,
  isoDate = '2024-06-15T08:30:00Z',
): string {
  const lat = 45.4 + offsetNorthMeters / 111_195
  const points: string[] = []
  for (let lon = 4.5; lon <= 4.5301; lon += 0.0002) {
    points.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(4)}"></trkpt>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>${isoDate}</time></metadata>
  <trk><trkseg>${points.join('\n')}</trkseg></trk>
</gpx>`
}

/** Les quatre onglets de la navigation compacte (issue #171). */
export const ONGLETS = ['carte', 'sorties', 'progression', 'reglages'] as const
export type CleOnglet = (typeof ONGLETS)[number]

/**
 * Se place sur un onglet — et ne fait rien si la barre n'existe pas.
 *
 * Le silence est délibéré. La barre n'apparaît qu'en dessous du point de
 * rupture, et l'ancienne disposition reste servie par
 * `?maquette=accordeons` : un test qui aurait à savoir dans laquelle il
 * tourne pour appeler cette fonction n'aurait rien gagné. Ici le même test
 * passe dans les deux, et n'exprime que ce qui l'intéresse — « je veux voir
 * les sorties », pas « je clique sur le deuxième bouton ».
 */
export async function ouvrirOnglet(page: Page, cle: CleOnglet): Promise<void> {
  const onglet = page.getByTestId(`onglet-${cle}`)
  if ((await onglet.count()) === 0) return
  await onglet.click()
}

/**
 * Exécute un contrôle sur chacun des quatre onglets, l'un après l'autre.
 *
 * Les audits de gabarit — cibles tactiles, tailles de texte — regardaient
 * une page où tout était empilé. Avec les onglets, ils ne voyaient plus
 * qu'un quart de l'application : les parcourir tous rend la couverture
 * qu'ils avaient, et l'étend à la navigation elle-même.
 *
 * En disposition accordéons, la boucle tourne une fois sur une page qui
 * contient déjà tout, et le résultat est le même qu'avant.
 */
export async function surChaqueOnglet(
  page: Page,
  controle: (cle: CleOnglet | 'tout') => Promise<void>,
): Promise<void> {
  const barre = page.getByTestId('barre-onglets')
  if ((await barre.count()) === 0) {
    await controle('tout')
    return
  }
  for (const cle of ONGLETS) {
    await ouvrirOnglet(page, cle)
    await controle(cle)
  }
}

/**
 * Vrai si l'élément est **réellement à l'écran**, et pas seulement présent.
 *
 * `toBeVisible` de Playwright ne suffit pas : un élément écrêté par un
 * ancêtre en `overflow: hidden` — le cas exact de la feuille glissante
 * repliée — garde un rectangle non vide et passe le test. Éprouvé : la
 * mutation qui remettait le défaut d'AUDIT_UX U3 laissait quatre tests
 * verts sur quatre.
 *
 * On demande donc au navigateur ce qu'il **peint** au centre de l'élément,
 * comme l'audit l'a fait pour prouver que le bouton du guide passait sous la
 * feuille. C'est la seule question dont la réponse ne se laisse pas
 * arranger.
 *
 * À appeler par `expect.poll` et non une fois : la feuille a une transition
 * de 0,2 s sur sa hauteur, et une mesure prise pendant l'animation ne dit
 * rien de l'état final.
 */
export async function estAlEcran(page: Page, testId: string): Promise<boolean> {
  const cible = page.getByTestId(testId)
  if ((await cible.count()) === 0) return false
  return cible.evaluate((element) => {
    const r = element.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const x = r.x + r.width / 2
    const y = r.y + r.height / 2
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      return false
    }
    const peint = document.elementFromPoint(x, y)
    return peint !== null && (element === peint || element.contains(peint))
  })
}
