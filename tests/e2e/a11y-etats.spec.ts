import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  activerLeGrosTexte,
  afficherTousLesReseaux,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  ONGLETS,
  ouvrirLaFicheDuGr7,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * axe-core dans tous les états, pas sur un seul écran (#575, sprint 3).
 *
 * `a11y.spec.ts` passe axe (WCAG 2 A/AA) sur la vue principale, « À propos »
 * et quelques panneaux — à **une** largeur, en thème clair, en texte normal.
 * C'est la forme exacte du trou du §6quinquies : une sonde qui ne regarde
 * qu'un écran ne garde qu'un écran. Au téléphone, « Sorties » et
 * « Réglages » ne sont même pas montés hors de leur onglet ; le thème
 * sombre (Yuki, #361) et le gros texte (Théo, Jeanine) n'avaient jamais été
 * passés à axe.
 *
 * Les seuils sont ceux de WCAG 2.1 AA, par les règles d'axe (§6sexies) ;
 * rien n'est inventé ici. Seules les violations « serious » et « critical »
 * comptent, comme dans `a11y.spec.ts`. La carte est exclue : son canevas
 * n'est pas du texte, et ses commandes appartiennent à MapLibre.
 */

const VUES = [
  { nom: 'téléphone', width: 390, height: 844, compact: true },
  { nom: 'PC', width: 1280, height: 800, compact: false },
] as const

async function violations(page: Page): Promise<string[]> {
  const resultats = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.maplibregl-map')
    .analyze()
  return resultats.violations
    .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

async function zoneChargee(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
}

for (const vue of VUES) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`axe — ${vue.nom}, thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
      test.use({
        viewport: { width: vue.width, height: vue.height },
        hasTouch: vue.compact,
        colorScheme: theme,
      })

      test('chaque onglet', async ({ page }) => {
        await zoneChargee(page)
        const fautes: string[] = []
        for (const onglet of vue.compact ? ONGLETS : (['tout'] as const)) {
          if (onglet !== 'tout') await ouvrirOnglet(page, onglet)
          for (const v of await violations(page)) fautes.push(`[${onglet}] ${v}`)
        }
        expect(fautes).toEqual([])
      })

      test('fiche ouverte', async ({ page }) => {
        await zoneChargee(page)
        await ouvrirLaFicheDuGr7(page, vue.compact)
        expect(await violations(page)).toEqual([])
      })

      test('tracé ouvert', async ({ page }) => {
        await zoneChargee(page)
        if (vue.compact) await ouvrirOnglet(page, 'sorties')
        await page.getByTestId('custom-draw').click()
        await expect(page.getByTestId('route-drawer-save')).toBeVisible()
        expect(await violations(page)).toEqual([])
      })
    })
  }
}

test.describe('axe — téléphone, gros texte', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('chaque onglet', async ({ page }) => {
    await zoneChargee(page)
    await activerLeGrosTexte(page, true)
    const fautes: string[] = []
    for (const onglet of ONGLETS) {
      await ouvrirOnglet(page, onglet)
      for (const v of await violations(page)) fautes.push(`[${onglet}] ${v}`)
    }
    expect(fautes).toEqual([])
  })
})
