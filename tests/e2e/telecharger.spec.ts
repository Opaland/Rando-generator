import { test, expect } from '@playwright/test'
import { buildGpx, mockExternalNetwork } from './helpers.ts'

/*
 * Recopiés depuis `src/core/telechargement.ts`, et pas importés : aucun
 * fichier e2e n'importe de `src`, parce que Playwright pilote
 * l'application **construite** et non ses sources. Un test unitaire garde
 * les trois copies — celle-ci, celle du cœur et celle du service worker —
 * de diverger, exactement comme il le fait déjà pour le message de
 * connectivité.
 */
const MESSAGE_PRECHARGER = 'sentiers:precharger'
const MESSAGE_PROGRES = 'sentiers:telechargement'

/**
 * Issue #153 — emporter une randonnée.
 *
 * Ce que ce fichier prouve, et ce qu'il ne prouve pas.
 *
 * Il prouve **la mécanique** : la page envoie une liste d'adresses, le
 * service worker les récupère, les range dans son cache à part, et rend
 * compte pas à pas avec des octets réellement reçus.
 *
 * Il ne prouve pas qu'une tuile de la Géoplateforme arrive : le réseau
 * sortant est coupé dans cet environnement, et `context.setOffline` de
 * Playwright ne s'applique de toute façon pas aux requêtes émises par le
 * service worker — c'est la leçon écrite dans `offline.spec.ts`, et elle
 * vaut ici aussi. Les adresses employées sont donc **de même origine**, ce
 * qui exerce exactement le même chemin de code. Le tri entre cache de
 * tuiles et cache de terrain, lui, est éprouvé par les tests unitaires.
 */

test.describe('télécharger une randonnée', () => {
  test.use({ serviceWorkers: 'allow' })

  async function serviceWorkerPret(page: import('@playwright/test').Page) {
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    )
  }

  test('met de côté ce qu’on lui demande, et dit combien ça pèse', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await serviceWorkerPret(page)

    const resultat = await page.evaluate(
      async ([messagePrecharger, messageProgres]) => {
        const cible = new URL('manifest.webmanifest', location.href).href
        const pas: unknown[] = []
        const fini = new Promise<Record<string, number>>((resolve) => {
          navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data as Record<string, unknown>
            if (data['type'] !== messageProgres) return
            pas.push(data)
            if (data['fini'] === true) resolve(data as Record<string, number>)
          })
        })
        navigator.serviceWorker.controller?.postMessage({
          type: messagePrecharger,
          urls: [cible],
        })
        const dernier = await fini

        // Ce qui compte : c'est bien dans un cache, et retrouvable.
        let range = false
        for (const nom of await caches.keys()) {
          if (!nom.endsWith('-terrain')) continue
          const cache = await caches.open(nom)
          if (await cache.match(cible)) range = true
        }
        return { dernier, pas: pas.length, range, cible }
      },
      [MESSAGE_PRECHARGER, MESSAGE_PROGRES] as const,
    )

    expect(resultat.range).toBe(true)
    expect(resultat.dernier['total']).toBe(1)
    expect(resultat.dernier['faites']).toBe(1)
    expect(resultat.dernier['echecs']).toBe(0)
    // Des octets **mesurés**, pas estimés : le manifeste n'est pas vide.
    expect(resultat.dernier['octets']).toBeGreaterThan(0)
  })

  /**
   * Une randonnée à laquelle il manque trois tuiles reste une randonnée
   * emportée. S'arrêter à la première erreur rendrait le bouton inutile sur
   * un réseau moyen — et c'est précisément le réseau qu'on a quand on
   * prépare une sortie depuis un train.
   */
  test('une adresse qui échoue n’arrête pas les autres', async ({ page }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await serviceWorkerPret(page)

    const dernier = await page.evaluate(
      async ([messagePrecharger, messageProgres]) => {
        const bonne = new URL('manifest.webmanifest', location.href).href
        // `.invalid` est réservé par la RFC 2606 : ce nom ne résout nulle
        // part, ni ici ni en intégration continue. Une adresse de même
        // origine n'aurait pas fait l'affaire — le serveur de
        // prévisualisation rend `index.html` pour tout chemin inconnu, si
        // bien que ma « mauvaise » adresse répondait 200 et que le test
        // comptait zéro échec.
        const mauvaise = 'https://sentiers.invalid/tuile.png'
        const fini = new Promise<Record<string, number>>((resolve) => {
          navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data as Record<string, unknown>
            if (data['type'] === messageProgres && data['fini'] === true) {
              resolve(data as Record<string, number>)
            }
          })
        })
        navigator.serviceWorker.controller?.postMessage({
          type: messagePrecharger,
          urls: [mauvaise, bonne],
        })
        return fini
      },
      [MESSAGE_PRECHARGER, MESSAGE_PROGRES] as const,
    )

    expect(dernier['total']).toBe(2)
    expect(dernier['faites']).toBe(2)
    expect(dernier['echecs']).toBe(1)
    expect(dernier['octets']).toBeGreaterThan(0)
  })

  test('une liste vide se termine sans rien faire', async ({ page }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await serviceWorkerPret(page)

    const dernier = await page.evaluate(
      async ([messagePrecharger, messageProgres]) => {
        const fini = new Promise<Record<string, number>>((resolve) => {
          navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data as Record<string, unknown>
            if (data['type'] === messageProgres && data['fini'] === true) {
              resolve(data as Record<string, number>)
            }
          })
        })
        navigator.serviceWorker.controller?.postMessage({
          type: messagePrecharger,
          urls: [],
        })
        return fini
      },
      [MESSAGE_PRECHARGER, MESSAGE_PROGRES] as const,
    )

    expect(dernier['total']).toBe(0)
    expect(dernier['faites']).toBe(0)
    expect(dernier['octets']).toBe(0)
  })
})

/**
 * Le bouton de la fiche détail (issue #153, troisième pierre).
 *
 * Ce que ce test prouve : la fiche calcule un corridor, annonce un nombre de
 * tuiles **exact**, remet cette liste au service worker quand on appuie, et
 * change de libellé au rythme des comptes rendus.
 *
 * Le service worker est ici remplacé par une doublure posée avant le
 * chargement de la page. Ce n'est pas un renoncement : les mécaniques du
 * vrai service worker sont éprouvées par les trois tests ci-dessus et par
 * `tests/unit/swPrecharger.test.ts`, qui l'exécute pour de bon. Ce qu'il
 * restait à établir, c'est le chemin entre le tracé et le message — et le
 * laisser télécharger de vraies tuiles ferait dépendre la suite de la
 * disponibilité de la Géoplateforme, en la martelant depuis l'intégration
 * continue à chaque exécution.
 */
test.describe('emporter une randonnée depuis la fiche', () => {
  async function poserDoublure(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
      const envoyes: unknown[] = []
      ;(window as unknown as Record<string, unknown>)['__emport'] = envoyes
      Object.defineProperty(navigator.serviceWorker, 'controller', {
        configurable: true,
        get: () => ({
          postMessage: (message: unknown) => {
            envoyes.push(message)
          },
        }),
      })
    })
  }

  test('annonce un compte de tuiles, puis suit ce qui descend', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await poserDoublure(page)
    await page.goto('/')

    await page.getByTestId('custom-input').setInputFiles({
      name: 'boucle-test.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(0), 'utf-8'),
    })
    const liste = page.getByTestId('custom-list')
    await expect(liste).toContainText('boucle-test')
    await liste
      .getByRole('button', { name: /boucle-test/ })
      .filter({ hasNotText: 'Supprimer' })
      .click()
    await page.getByTestId('itinerary-card-detail-link').click()

    const bouton = page.getByTestId('itinerary-detail-emporter')
    /*
      `toHaveText` et non `toContainText` : « Emporter cette randonnée »
      seul serait accepté par le second, et c'est précisément le cas qu'on
      veut voir échouer — un bouton qui n'annoncerait aucun compte.
    */
    await expect(bouton).toHaveText(/^Emporter cette randonnée \(\d+ tuiles?\)$/)

    await bouton.click()

    // Ce que la page a réellement remis au service worker.
    const envoye = await page.evaluate(
      ([messagePrecharger]) => {
        const envoyes = (window as unknown as Record<string, unknown>)[
          '__emport'
        ] as { type: string; urls: string[] }[]
        return envoyes.find((m) => m.type === messagePrecharger) ?? null
      },
      [MESSAGE_PRECHARGER] as const,
    )
    expect(envoye).not.toBeNull()
    const urls = envoye?.urls ?? []
    expect(urls.length).toBeGreaterThan(1)
    expect(urls.filter((u) => u.includes('data.geopf.fr/wmts')).length).toBe(
      urls.length - 1,
    )
    // La dernière adresse est le profil altimétrique : on n'emporte pas un
    // fond de carte sans le relief qui va avec.
    expect(urls.at(-1)).toContain('/altimetrie/')

    // Le bouton ne se relance pas tant que ça descend.
    await expect(bouton).toBeDisabled()

    await page.evaluate(
      ([messageProgres, total]) => {
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: messageProgres,
              faites: 3,
              total,
              octets: 3 * 1024 * 1024,
              echecs: 0,
              fini: false,
            },
          }),
        )
      },
      [MESSAGE_PROGRES, urls.length] as const,
    )
    await expect(bouton).toHaveText(`3 / ${String(urls.length)} · 3 Mo`)

    await page.evaluate(
      ([messageProgres, total]) => {
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: messageProgres,
              faites: total,
              total,
              octets: 5 * 1024 * 1024,
              echecs: 2,
              fini: true,
            },
          }),
        )
      },
      [MESSAGE_PROGRES, urls.length] as const,
    )
    await expect(bouton).toHaveText('Emportée · 5 Mo · 2 manquantes')
    await expect(page.getByTestId('emporter-manquantes')).toBeVisible()
  })

  /**
   * Fermer la fiche arrête ce qui court : sinon le service worker
   * continuerait à marteler la Géoplateforme derrière un écran quitté.
   */
  test('referme et arrête', async ({ page }) => {
    await mockExternalNetwork(page)
    await poserDoublure(page)
    await page.goto('/')

    await page.getByTestId('custom-input').setInputFiles({
      name: 'boucle-test.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(0), 'utf-8'),
    })
    const liste = page.getByTestId('custom-list')
    await expect(liste).toContainText('boucle-test')
    await liste
      .getByRole('button', { name: /boucle-test/ })
      .filter({ hasNotText: 'Supprimer' })
      .click()
    await page.getByTestId('itinerary-card-detail-link').click()
    await page.getByTestId('itinerary-detail-emporter').click()
    await page.getByTestId('itinerary-detail-close').click()

    const arrets = await page.evaluate(() => {
      const envoyes = (window as unknown as Record<string, unknown>)[
        '__emport'
      ] as { type: string }[]
      return envoyes.filter(
        (m) => m.type === 'sentiers:arreter-telechargement',
      ).length
    })
    expect(arrets).toBe(1)
  })
})
