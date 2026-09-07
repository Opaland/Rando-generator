import { test, expect } from '@playwright/test'
import {
  mockExternalNetwork,
  mockGeocode,
  mockTilesOk,
  mockElevation,
  fermerLeGuide,
  afficherTousLesReseaux,
  clickOnMap,
  hasMap,
  estAlEcran,
  installerGeolocalisationPilotee,
} from './helpers.ts'
import { buildZip } from '../fixtures/zip.ts'

/**
 * Issue #499 — la sonde des règles d'écran ne garde qu'une alerte sur trente.
 *
 * `regles-d-ecran.spec.ts` pose « une alerte est-elle dans la fenêtre, et
 * peinte ? » à travers huit états, mais aucun des huit ne déclenche neuf des
 * dix `role="alert"` du dépôt — `zone-error` est la seule à y apparaître.
 * Les vingt `role="status"` restent hors de ce fichier : l'issue penche pour
 * les alertes d'abord, « c'est fini en un sprint et ça couvre précisément la
 * famille où le défaut de Zoé est né ».
 *
 * Plutôt que d'ajouter neuf états à la matrice des quatre largeurs — ce que
 * #491 signale déjà comme un coût qui a triplé sans que personne le voie —
 * ce fichier déclenche chaque alerte une fois, à la largeur par défaut, et
 * lui pose la même question que la sonde générale : `estAlEcran`, le
 * contrôle déjà nommé pour ça plutôt que d'être réécrit ici (CLAUDE.md §4).
 *
 * Une seule largeur est un choix de présentation documenté (§2), pas une
 * mesure : le recouvrement de ces dix alertes aux trois autres largeurs
 * reste non ausculté.
 */

test('sortiesreseau : une destination non répertoriée se voit', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)

  // Même observateur que celui qui alimente le panneau « Ce qui est sorti
  // d'ici » (src/lib/observerReseau.ts) : il note l'URL avant d'appeler le
  // vrai fetch, donc l'échec réseau qui suit ne change rien à la mesure.
  await page.evaluate(() => {
    fetch('https://exemple-non-repertorie.invalid/x').catch(() => undefined)
  })

  await page.getByTestId('about-open').click()
  const alerte = page.getByTestId('sorties-inconnues')
  await expect(alerte).toBeVisible()
  await expect(alerte).toContainText('exemple-non-repertorie.invalid')
  expect(await estAlEcran(page, 'sorties-inconnues')).toBe(true)
})

test('fuite-trace : une fuite injectée se voit', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'surveillee.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">' +
        '<trk><name>sortie surveillée</name><trkseg>' +
        '<trkpt lat="45.412345" lon="4.512345"><time>2026-08-01T08:00:00Z</time></trkpt>' +
        '<trkpt lat="45.412445" lon="4.512445"><time>2026-08-01T08:01:00Z</time></trkpt>' +
        '</trkseg></trk></gpx>',
      'utf-8',
    ),
  })
  await expect(page.getByTestId('tracks-list')).toContainText(
    'surveillee.gpx',
    { timeout: 15_000 },
  )

  await page.evaluate(async () => {
    await fetch('/__sonde-de-fuite', {
      method: 'POST',
      body: JSON.stringify({ points: [[4.512345, 45.412345]] }),
    }).catch(() => undefined)
  })

  await page.getByTestId('about-open').click()
  const alerte = page.getByTestId('fuite-trace')
  await expect(alerte).toBeVisible()
  expect(await estAlEcran(page, 'fuite-trace')).toBe(true)
})

test('installation-echec : un prompt() qui échoue se voit', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt') as Event & {
      prompt?: () => Promise<void>
      userChoice?: Promise<{ outcome: string }>
    }
    event.prompt = () => Promise.reject(new Error('boom'))
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })
  await page.getByTestId('installer').click()

  const alerte = page.getByTestId('installation-echec')
  await expect(alerte).toBeVisible()
  expect(await estAlEcran(page, 'installation-echec')).toBe(true)
})

test('sortie-erreur : une erreur de géolocalisation en cours de route se voit', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await installerGeolocalisationPilotee(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('sortie-demarrer').click()
  await expect(page.getByTestId('temoin-sortie')).toHaveAttribute(
    'data-etat',
    'enregistrement',
  )

  await page.evaluate(() => {
    ;(
      window as unknown as {
        __sentiersGeo: { echouer: (code: number) => void }
      }
    ).__sentiersGeo.echouer(2)
  })

  const alerte = page.getByTestId('sortie-erreur')
  await expect(alerte).toBeVisible()
  expect(await estAlEcran(page, 'sortie-erreur')).toBe(true)
})

test('lieu-error : un service de recherche en panne se voit', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockGeocode(page, { erreur: 503 })
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('lieu-input').fill('Saint-Étienne')
  await page.getByTestId('lieu-submit').click()

  const alerte = page.getByTestId('lieu-error')
  await expect(alerte).toContainText('503')
  expect(await estAlEcran(page, 'lieu-error')).toBe(true)
})

test('route-drawer-error : un point hors réseau se voit', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  test.skip(
    !(await hasMap(page)),
    'WebGL indisponible dans ce navigateur headless',
  )

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('custom-draw').click()
  await clickOnMap(page, 4.55, 45.42)

  const alerte = page.getByTestId('route-drawer-error')
  await expect(alerte).toContainText(/à proximité/i)
  expect(await estAlEcran(page, 'route-drawer-error')).toBe(true)
})

test('gpx-errors : une archive sans trace se voit', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)

  const archive = await buildZip([
    { nom: 'profile.csv', contenu: 'nom,prenom' },
  ])
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'export_vide.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  })

  const alerte = page.getByTestId('gpx-errors')
  await expect(alerte).toContainText(/aucune trace/i)
  expect(await estAlEcran(page, 'gpx-errors')).toBe(true)
})

test('geo-error : un refus de localisation se voit', async ({ page }) => {
  // Chromium headless ne rappelle jamais quand la permission est retirée :
  // on simule directement le refus renvoyé par l'API (même recette que
  // tests/e2e/position.spec.ts).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (
          _onSuccess: unknown,
          onError: (error: { code: number; message: string }) => void,
        ) => {
          setTimeout(() => {
            onError({ code: 1, message: 'User denied Geolocation' })
          }, 0)
          return 1
        },
        clearWatch: () => undefined,
        getCurrentPosition: () => undefined,
      },
    })
  })
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)

  await page.getByTestId('locate-toggle').click()
  const alerte = page.getByTestId('geo-error')
  await expect(alerte).toBeVisible({ timeout: 15_000 })
  expect(await estAlEcran(page, 'geo-error')).toBe(true)
})

test('db-warning : un IndexedDB indisponible se voit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    })
  })
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)

  const alerte = page.getByTestId('db-warning')
  await expect(alerte).toBeVisible()
  expect(await estAlEcran(page, 'db-warning')).toBe(true)
})

test('map-error : une accélération graphique indisponible se voit', async ({
  page,
}) => {
  // Force le chemin déjà prévu par useMapInstance.ts pour un navigateur sans
  // WebGL, plutôt que de dépendre de l'aléa du navigateur d'intégration
  // continue (les autres tests, eux, sautent quand WebGL manque).
  //
  // Renvoyer `null` ne suffit pas : mesuré, MapLibre avale alors l'échec en
  // interne (un `GPUInitializationError` seulement journalisé en console) et
  // construit quand même son objet — `useMapInstance.ts` ne le voit jamais,
  // puisque son `try/catch` entoure `new Map()`, qui ne lève rien dans ce
  // cas. Lever une exception depuis `getContext`, elle, remonte bien jusqu'au
  // constructeur et déclenche le repli attendu.
  await page.addInitScript(() => {
    type FonctionContexte = (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) => RenderingContext | null
    // Rappelé par `.call(this, …)` juste en dessous : jamais détaché de son objet.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype
      .getContext as unknown as FonctionContexte
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ): RenderingContext | null {
      if (type.includes('webgl')) {
        throw new Error('WebGL indisponible (simulé pour le test)')
      }
      return original.call(this, type, ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)

  const alerte = page.getByTestId('map-error')
  await expect(alerte).toBeVisible({ timeout: 15_000 })
  expect(await estAlEcran(page, 'map-error')).toBe(true)
})
