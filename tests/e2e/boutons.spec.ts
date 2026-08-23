import { test, expect } from '@playwright/test'
import { mockExternalNetwork, fermerLeGuide, ouvrirOnglet } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * AUDIT_UX.md, constat U9 — trois traitements pour l'action principale.
 *
 * « Voir un exemple » était vert-noir plein, « Ajouter un itinéraire » rouge
 * balisage plein, et « Chercher » désactivé apparaissait en rose : `opacity:
 * 0.55` sur le rouge posé sur le papier crème donne un contraste **effectif**
 * de 1,87:1. Un contrôle désactivé est exempté du critère WCAG 1.4.3, donc ce
 * n'était pas une non-conformité — mais il ne se lisait pas comme
 * « désactivé », il se lisait comme une troisième couleur de marque.
 *
 * Ce qui est gardé ici est mesuré, pas jugé à l'œil : **deux actions
 * principales se peignent pareil**, et un bouton désactivé ne se peint comme
 * aucune des deux.
 */

test.use({ viewport: { width: 1280, height: 800 } })

/** La couleur de fond réellement peinte, en `rgb(...)`. */
async function fond(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .evaluate((e) => getComputedStyle(e).backgroundColor)
}

test('deux actions principales, une seule couleur', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // « Voir un exemple », dans le guide de premier lancement.
  await expect(page.getByTestId('voir-un-exemple')).toBeVisible()
  const guide = await fond(page, 'voir-un-exemple')

  await fermerLeGuide(page)
  await ouvrirOnglet(page, 'sorties')
  // « Ajouter un itinéraire », dans le panneau.
  await expect(page.getByTestId('custom-browse')).toBeVisible()
  const panneau = await fond(page, 'custom-browse')

  expect(
    guide,
    `« Voir un exemple » est peint ${guide}, « Ajouter un itinéraire » ${panneau}`,
  ).toBe(panneau)
})

test('un bouton désactivé ne se peint comme aucune action', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await ouvrirOnglet(page, 'carte')

  // Champ vide : « Chercher » est désactivé.
  const chercher = page.getByTestId('lieu-submit')
  await expect(chercher).toBeDisabled()
  const desactive = await fond(page, 'lieu-submit')

  await ouvrirOnglet(page, 'sorties')
  const actif = await fond(page, 'custom-browse')

  expect(
    desactive,
    'le bouton désactivé se peint comme une action principale',
  ).not.toBe(actif)

  // Et il ne le fait pas non plus par transparence : c'est ce qui donnait le
  // rose. On demande donc l'opacité effective de l'élément.
  const opacite = await chercher.evaluate((e) => getComputedStyle(e).opacity)
  expect(Number(opacite)).toBe(1)
})
