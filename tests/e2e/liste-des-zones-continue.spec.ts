import { test, expect, type Page } from '@playwright/test'
import {
  activerLeGrosTexte,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from './helpers.ts'

/**
 * La liste des zones dit qu'elle continue (#585).
 *
 * Mesuré le 22/10 à 1 024 px : les 280 px de `zone-liste` coupaient sous un
 * intertitre seul — à la souris sous « Auvergne-Rhône-Alpes, par
 * département » et un liseré vide, au doigt sous un intertitre qui semblait
 * chapeauter le formulaire suivant, en gros texte au milieu de l'intertitre.
 *
 * Ce qui est demandé est **peint** : un pseudo-élément, `elementFromPoint`
 * le traverse (`pointer-events: none`) et ne prouverait rien (§1bis). On
 * compare donc les pixels de la bande du bas, la bande montrée puis cachée.
 * L'essai du 22/10 l'enseigne : un test qui comptait des dégradés présents
 * était vert, et rien n'était peint.
 */
const CONFIGURATIONS = [
  { nom: 'souris', hasTouch: false, grosTexte: false },
  { nom: 'doigt', hasTouch: true, grosTexte: false },
  { nom: 'souris, gros texte', hasTouch: false, grosTexte: true },
] as const

const CACHER = '[data-testid="zone-liste"]::after { visibility: hidden !important; }'

/** La bande du bas de la liste, telle qu'elle est peinte, avec et sans le fondu. */
async function bandeAvecEtSans(page: Page): Promise<{ avec: Buffer; sans: Buffer }> {
  const liste = page.getByTestId('zone-liste')
  const boite = await liste.boundingBox()
  if (!boite) throw new Error('zone-liste introuvable')
  const bande = { x: boite.x, y: boite.y + boite.height - 32, width: boite.width - 16, height: 30 }
  const avec = await page.screenshot({ clip: bande, animations: 'disabled' })
  const style = await page.addStyleTag({ content: CACHER })
  const sans = await page.screenshot({ clip: bande, animations: 'disabled' })
  await style.evaluate((el) => {
    ;(el as HTMLStyleElement).remove()
  })
  return { avec, sans }
}

for (const config of CONFIGURATIONS) {
  test.describe(`1 024 px, ${config.nom}`, () => {
    test.use({ viewport: { width: 1024, height: 768 }, hasTouch: config.hasTouch })

    test('le bas de la liste dit « ça continue », et se tait au bout', async ({ page }) => {
      await mockExternalNetwork(page)
      await mockTilesOk(page)
      await mockElevation(page)
      await page.goto('/')
      await fermerLeGuide(page)
      if (config.grosTexte) await activerLeGrosTexte(page, false)

      const liste = page.getByTestId('zone-liste')
      await liste.scrollIntoViewIfNeeded()
      await liste.evaluate((el) => {
        el.scrollTop = 0
      })
      // La liste défile bien : sinon il n'y aurait rien à annoncer.
      expect(await liste.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true)

      await expect
        .poll(async () => {
          const { avec, sans } = await bandeAvecEtSans(page)
          return !avec.equals(sans)
        }, { message: 'rien n’est peint en bas d’une liste qui continue' })
        .toBe(true)

      await liste.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect
        .poll(async () => {
          const { avec, sans } = await bandeAvecEtSans(page)
          return avec.equals(sans)
        }, { message: '« ça continue » est encore peint au bout de la liste' })
        .toBe(true)
    })
  })
}
