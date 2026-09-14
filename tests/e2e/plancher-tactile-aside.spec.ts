import { test, expect } from '@playwright/test'
import { mockExternalNetwork, fermerLeGuide } from './helpers.ts'

/**
 * Le plancher tactile de 44 px (#363) est neutralisé en silence à
 * l'intérieur de tout `<aside>` (#527).
 *
 * `src/index.css` porte deux règles qui se battent sur `min-width` :
 *
 * - `@media (pointer: coarse) { …, button, … { min-width: var(--cible-mini) } }`
 *   (#363), spécificité (0,0,1) sur `button` ;
 * - `aside :is(button, label, p, li, h2, h3, span, output) { min-width: 0 }`
 *   (#173, éviter le débordement latéral d'un long libellé), spécificité
 *   (0,0,2) — plus élevée, donc gagnante quel que soit l'ordre.
 *
 * Le panneau de zone est un `<aside>` (`src/App.tsx`) : ses boutons perdent
 * donc leur plancher de largeur. Ça ne se voit sur aucun bouton aujourd'hui
 * — la grille les rend déjà larges de 165 à 268 px — mais la garde
 * elle-même est morte, silencieusement, exactement ce que #363 existait
 * pour empêcher.
 *
 * Mesurer le **rendu** (comme `regles-d-ecran.spec.ts` le fait déjà) ne
 * peut pas voir ça : il faut lire la propriété CSS calculée, pas la boîte
 * peinte.
 */
test.describe('le plancher tactile de #363 dans un <aside>', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('un bouton de zone garde min-width: 44px au doigt', async ({
    page,
  }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await fermerLeGuide(page)

    const bouton = page.getByTestId('zone-pilat')
    await expect(bouton).toBeVisible({ timeout: 15_000 })

    const minWidth = await bouton.evaluate(
      (el) => getComputedStyle(el).minWidth,
    )
    expect(
      minWidth,
      'le plancher tactile de #363 est neutralisé par la règle de #173 sur' +
        ' les asides (#527) : min-width calculé au lieu de 44px',
    ).toBe('44px')
  })
})
