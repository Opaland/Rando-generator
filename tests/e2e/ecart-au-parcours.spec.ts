import { test, expect } from '@playwright/test'
import { mockExternalNetwork, openDetailFromMap, hasMap } from './helpers.ts'

/**
 * Où l'on est par rapport au parcours suivi (issue #154).
 *
 * Position simulée à 45,405 — soit environ **550 m au nord** du GR 7 de la
 * fixture, qui suit la latitude 45,4.
 *
 * L'issue interdit nommément d'en faire un dispositif de sécurité :
 *
 * > Sentiers est un carnet, pas un GPS de secours (…) une alerte mal
 * > formulée le contredirait — avec des conséquences réelles si quelqu'un
 * > s'y fiait en montagne.
 *
 * Ce test garde donc les deux moitiés : que la phrase apparaisse, et
 * qu'elle **n'alarme pas**. La seconde compte plus que la première.
 */
test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 45.405, longitude: 4.505 },
})

test('la fiche dit où l’on est par rapport au parcours, sans alarmer', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  test.skip(
    !(await hasMap(page)),
    'WebGL indisponible dans ce navigateur headless',
  )
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Sans position active, rien n'est affiché : on ne mesure pas un écart à
  // partir d'une position qu'on n'a pas.
  await openDetailFromMap(page, 4.502, 45.4)
  await expect(page.getByTestId('detail-ecart')).toHaveCount(0)

  /*
    Le suivi s'active **sans fermer la fiche** : la boutonner se décale quand
    elle est ouverte, précisément pour rester atteignable.

    La fermer et rouvrir ne marcherait pas — activer la position recadre la
    carte sur l'utilisateur, et le point cliqué ne tombe plus sur le même
    tracé. Le test a échoué comme ça une première fois, et c'était le test
    qui avait tort.
  */
  await page.getByTestId('locate-toggle').click()

  const ecart = page.getByTestId('detail-ecart')
  await expect(ecart).toBeVisible({ timeout: 15_000 })
  await expect(ecart).toContainText('Vous êtes à')
  await expect(ecart).toContainText('GR 7')

  for (const interdit of ['Attention', 'Alerte', 'Danger', 'Hors itinéraire']) {
    await expect(
      ecart,
      `la phrase alarme : « ${interdit} » — Sentiers est un carnet, pas un GPS de secours`,
    ).not.toContainText(interdit)
  }
})
