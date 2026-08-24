import { test, expect, type Page } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Seuil « bouclé » réglable (issue #92).
 *
 * La condition posée par l'issue : le seuil retenu doit rester affiché
 * partout où le mot « bouclé » apparaît. Sans quoi le mot devient un
 * mensonge personnalisable.
 */
test('le seuil « bouclé » se règle, se voit, et survit au rechargement', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

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

  // Le jeu d'essai boucle un itinéraire à 100 % : il compte quel que soit
  // le seuil, et c'est le libellé qui doit suivre le réglage.
  const boucles = page.getByTestId('global-completed')
  await expect(boucles).toContainText('au moins 95 % parcourus')

  await page.getByTestId('completion-90').check()
  await expect(boucles).toContainText('au moins 90 % parcourus')

  await page.getByTestId('completion-100').check()
  await expect(boucles).toContainText('au moins 100 % parcourus')

  /*
    Le rechargement suit le clic **sans rien attendre entre les deux**, et
    c'est exactement le geste que décrit l'issue #203.

    Le test attendait auparavant que le réglage soit écrit avant de recharger.
    Cette attente corrigeait le test et non le produit : la fenêtre restait
    ouverte pour une personne, qui elle ne lit pas IndexedDB avant d'appuyer
    sur « recharger ». Les réglages sont écrits dans `localStorage` depuis
    #203, dont l'écriture est synchrone par contrat — il n'y a plus de fenêtre
    à attendre.

    La preuve déterministe est ailleurs : `tests/unit/appStore.test.ts`
    constate que la valeur est écrite quand le setter rend la main. Ici, on
    vérifie que le geste complet tient, dans un vrai navigateur.
  */
  await page.reload()
  await expect(page.getByTestId('completion-100')).toBeChecked({
    timeout: 15_000,
  })

  // Et là où il est écrit : dans le magasin synchrone, pas dans IndexedDB.
  expect(await seuilEnregistre(page)).toBe(100)
})

/**
 * Lit le seuil réellement enregistré, sans passer par le store.
 *
 * Il vivait dans le magasin `settings` d'IndexedDB ; il vit dans
 * `localStorage` depuis #203. Ce test lisait donc la bonne question au
 * mauvais endroit, et rendait `undefined` — une valeur qu'un `toBe(100)`
 * refuse, heureusement.
 */
async function seuilEnregistre(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const brut = localStorage.getItem('sentiers.reglage.completionPct')
    return brut === null ? null : (JSON.parse(brut) as unknown)
  })
}
