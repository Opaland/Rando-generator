import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

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
