import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  clickOnMap,
  estAlEcran,
  hasMap,
  mockElevation,
  mockExternalNetwork,
} from './helpers.ts'

/**
 * Le panneau de tracé ne se fait rien peindre par-dessus, et ne peint rien
 * par-dessus le crédit de la carte (#544).
 *
 * Mesuré le 18/10 à 1 280 × 720 : « Ma position » couvrait « Enregistrer »
 * (le clic était intercepté), « Démarrer une sortie » couvrait « Fermer la
 * boucle », et le panneau masquait 32 des 80 points de la ligne
 * d'attribution. Le cas était réglé pour la fiche depuis le 24/08, jamais
 * pour ce panneau-ci : aucun des dix états des règles d'écran ne l'ouvre
 * (§6quinquies — ce qui ne s'ouvre qu'à la demande est ce qu'une sonde
 * oublie).
 *
 * Grand écran seulement : sous le point de rupture, c'est la feuille du
 * panneau qui recouvre le tracé, un défaut à part (#546), qui demande de
 * décider comment les deux se partagent l'écran.
 */
test.use({ viewport: { width: 1280, height: 720 } })

test('le tracé ouvert : rien sur « Enregistrer », rien sur le crédit', async ({
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
  await afficherTousLesReseaux(page)
  await page.getByTestId('custom-draw').click()
  await clickOnMap(page, 4.5, 45.4)
  await clickOnMap(page, 4.53, 45.4)
  await expect(page.getByTestId('route-drawer-stats')).toContainText('2 étapes')

  // Ce qui est peint au centre du bouton, pas son existence (§1bis).
  await expect.poll(() => estAlEcran(page, 'route-drawer-save')).toBe(true)

  // Les commandes flottantes et le panneau ne se chevauchent pas.
  const chevauchement = await page.evaluate(() => {
    const boite = (id: string) =>
      document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()
    const panneau = boite('route-drawer')
    const position = boite('locate-toggle')
    if (!panneau || !position) return null
    return !(
      position.right <= panneau.left ||
      position.left >= panneau.right ||
      position.bottom <= panneau.top ||
      position.top >= panneau.bottom
    )
  })
  expect(chevauchement, '« Ma position » est posé sur le panneau de tracé').toBe(false)

  // Le crédit de la carte reste peint sur toute sa longueur : 80 points
  // répartis sur deux lignes, tous doivent tomber sur l'attribution.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const attribution = document.querySelector('.maplibregl-ctrl-attrib')
        if (!attribution) return -1
        const b = attribution.getBoundingClientRect()
        let caches = 0
        for (let i = 0; i < 40; i++) {
          for (const fy of [0.3, 0.7]) {
            const x = b.x + (b.width * (i + 0.5)) / 40
            const y = b.y + b.height * fy
            if (!attribution.contains(document.elementFromPoint(x, y))) caches++
          }
        }
        return caches
      }),
    )
    .toBe(0)
})
