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

  // Le réglage se garde, comme la tolérance — mais il faut d'abord qu'il
  // soit écrit. `setCompletionPct` met l'état à jour synchronement, puis
  // écrit dans IndexedDB sans que l'interface attende cette écriture :
  // recharger dans cette fenêtre annule la transaction en cours, et le
  // réglage est perdu.
  //
  // Mesuré : la suite complète prenait ce test en défaut environ une fois
  // sur deux, jamais lorsqu'il était lancé seul — et toute lecture de la
  // base intercalée avant le rechargement le faisait passer à tous les
  // coups, une transaction de lecture attendant les écritures déjà ouvertes
  // sur le même magasin. C'est cette lecture-là qui manquait au test, pas
  // une attente arbitraire : « survit au rechargement » suppose « a été
  // écrit », et le test ne vérifiait que la seconde moitié de la phrase.
  await expect.poll(() => seuilEnBase(page), { timeout: 5_000 }).toBe(100)

  await page.reload()
  await expect(page.getByTestId('completion-100')).toBeChecked({
    timeout: 15_000,
  })
})

/** Lit le seuil réellement écrit dans IndexedDB, sans passer par le store. */
async function seuilEnBase(page: Page): Promise<unknown> {
  return page.evaluate(
    async () =>
      await new Promise<unknown>((resolve) => {
        const requete = indexedDB.open('sentiers')
        requete.onsuccess = () => {
          const transaction = requete.result.transaction('settings', 'readonly')
          const lecture = transaction.objectStore('settings').get('completionPct')
          lecture.onsuccess = () => {
            resolve(lecture.result)
          }
          lecture.onerror = () => {
            resolve(null)
          }
        }
        requete.onerror = () => {
          resolve(null)
        }
      }),
  )
}
