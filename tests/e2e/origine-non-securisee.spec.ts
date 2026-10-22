import { test, expect } from '@playwright/test'
import { estAlEcran, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #561 : page blanche quand le navigateur n'a pas de service worker.
 *
 * Le cas réel est l'ouverture de `npm run preview -- --host` par l'IP du
 * réseau local, pour essayer l'application sur un téléphone : l'origine
 * n'est pas sécurisée, et `navigator.serviceWorker` n'existe pas du tout.
 *
 * Sous Chromium, `localhost` et `127.0.0.1` sont des contextes sécurisés :
 * aucun autre e2e ne pouvait le voir. Plutôt que de retirer la propriété à
 * la main — ce qui supposerait de savoir ce qu'un vrai contexte non
 * sécurisé retire —, la page est servie sous un nom qui n'est pas local,
 * `http://sentiers.lan:4173`, et chaque requête est relayée vers la
 * prévisualisation. Le navigateur juge alors l'origine lui-même.
 */
const ORIGINE = 'http://sentiers.lan:4173'

test('la page se peint sur une origine non sécurisée, sans service worker', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route(`${ORIGINE}/**`, async (route) => {
    const url = route.request().url().replace(ORIGINE, 'http://localhost:4173')
    await route.fulfill({ response: await route.fetch({ url }) })
  })
  const erreurs: string[] = []
  page.on('pageerror', (erreur) => erreurs.push(erreur.message))

  await page.goto(`${ORIGINE}/`)

  // La condition du défaut, vérifiée plutôt que supposée : sans elle, le
  // test passerait pour une raison qu'on n'a pas voulue (§1bis).
  expect(
    await page.evaluate(() => ({
      securise: window.isSecureContext,
      serviceWorker: 'serviceWorker' in navigator,
    })),
  ).toEqual({ securise: false, serviceWorker: false })

  await expect.poll(() => estAlEcran(page, 'en-tete')).toBe(true)
  expect(erreurs).toEqual([])
})
