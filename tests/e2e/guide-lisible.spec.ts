import { test, expect } from '@playwright/test'
import { mockExternalNetwork, estAlEcran } from './helpers.ts'

/**
 * AUDIT_UX.md, constat U1 — le défaut le plus grave de l'audit.
 *
 * Le guide de premier lancement propose « Voir un exemple », qui charge des
 * boucles réelles et trois sorties fictives. C'est **le seul chemin qui
 * montre le produit à quelqu'un qui n'a encore aucune trace**. Mesuré sur
 * 390 × 844 : le bouton tombait 46 px sous le bord de la feuille, et
 * `elementFromPoint` en son centre ne le renvoyait pas.
 *
 * Ce qui est gardé ici n'est pas « la feuille est repliée » mais **que le
 * bouton est réellement à l'écran** — c'est l'énoncé qui était faux, et il
 * restera vrai quelle que soit la façon dont on s'y prend plus tard.
 */

const TELEPHONES = [
  { nom: 'iPhone 12', viewport: { width: 390, height: 844 } },
  // Le plus petit écran couramment servi. Si le guide y tient, il tient
  // partout — et c'est là que la mesure d'origine aurait dû être faite.
  { nom: 'petit écran', viewport: { width: 360, height: 640 } },
]

for (const { nom, viewport } of TELEPHONES) {
  test.describe(nom, () => {
    test.use({ viewport })

    test('le guide et son bouton sont atteignables au premier lancement', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await page.goto('/')
      await expect(page.getByTestId('onboarding')).toHaveCount(1)

      await expect
        .poll(() => estAlEcran(page, 'voir-un-exemple'), {
          message: 'le bouton « Voir un exemple » n’est pas à l’écran',
        })
        .toBe(true)
      await expect
        .poll(() => estAlEcran(page, 'onboarding-fermer'), {
          message: 'le bouton de fermeture du guide n’est pas à l’écran',
        })
        .toBe(true)
      // Et le guide dit encore ce que fait le produit. Sur un écran court,
      // quelque chose doit défiler ; la première fois qu'on a réservé la
      // bande d'attribution, ce sont les trois étapes qui ont cédé — leur
      // rangée est tombée à zéro pixel, et aucun test ne l'a vu. Ce qui
      // défile, ce sont les phrases du bas ; l'entrée en matière reste.
      await expect
        .poll(() => estAlEcran(page, 'guide-etape-1'), {
          message: 'la première étape du guide n’est pas à l’écran',
        })
        .toBe(true)

      // Et il se laisse vraiment toucher : c'est ce que le recouvrement
      // empêchait. `click` échoue si un autre élément intercepte le geste,
      // ce qui est exactement le défaut d'origine.
      await page.getByTestId('voir-un-exemple').click({ timeout: 5_000 })
    })

    test('la feuille reprend sa place dès que le guide est fermé', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await page.goto('/')
      const feuille = page.getByTestId('sidebar')
      expect(await feuille.getAttribute('data-position')).toBe('repliee')

      await page.getByTestId('onboarding-fermer').click()
      // À la première visite il n'y a rien à voir sur la carte et tout à
      // faire dans le panneau : il s'ouvre, sans qu'on ait touché la poignée.
      await expect(feuille).toHaveAttribute('data-position', 'moitie')
    })
  })
}
