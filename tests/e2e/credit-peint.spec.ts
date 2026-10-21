import { test, expect, type Page } from '@playwright/test'
import {
  activerLeGrosTexte,
  afficherTousLesReseaux,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Issues #553, #555 et #556 — le crédit de la carte recouvert.
 *
 * Mesuré par la revue du 19/10, fiche du GR 7 ouverte : 42 % du crédit
 * recouvert par la fiche à 1 280, 54 % à 1 024, 100 % à 800 et 390. Les
 * liens « Métropole de Lyon », « Province Nord », « Département de
 * l'Isère » peints par la fiche : la carte s'affichait sans crédit ODbL ni
 * Licence Ouverte lisible. Et au doigt, le ⓘ était peint par « Démarrer » :
 * le toucher lançait un enregistrement GPS.
 *
 * Tranché par Cédric le 20/10 : le crédit **au-dessus de tout** — des
 * surimpressions de la carte, pas de la feuille, qui est un plan à part.
 *
 * Ce qui est peint, point par point sur le rectangle du crédit (§1bis), et
 * non sa simple présence.
 */
async function partNonPeinte(page: Page): Promise<number> {
  return page.evaluate(() => {
    const credit = document.querySelector('.maplibregl-ctrl-attrib')
    if (!credit) return 1
    const r = credit.getBoundingClientRect()
    let caches = 0
    let total = 0
    for (let i = 1; i < 10; i++) {
      for (let j = 1; j < 4; j++) {
        const x = r.x + (r.width * i) / 10
        const y = r.y + (r.height * j) / 4
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
        total += 1
        const peint = document.elementFromPoint(x, y)
        if (!peint || !credit.contains(peint)) caches += 1
      }
    }
    return total === 0 ? 1 : caches / total
  })
}

async function ouvrirLaFicheDuGr7(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
}

for (const largeur of [1024, 1280]) {
  test.describe(`${String(largeur)} px`, () => {
    test.use({ viewport: { width: largeur, height: 768 } })

    test('la fiche ouverte ne recouvre pas le crédit de la carte', async ({ page }) => {
      await ouvrirLaFicheDuGr7(page)
      // La fiche existe bien là où le crédit est : sans recouvrement
      // possible, le test ne départagerait rien.
      await expect.poll(() => partNonPeinte(page)).toBe(0)
    })

    /*
      #553, second volet : le zoom. Mesuré le 19/10, fiche du GR 7 ouverte :
      à 1 280 le centre des trois boutons était peint par la fiche, et à
      1 024 au doigt le « + » l'était par sa croix — taper « + » fermait la
      fiche.
    */
    for (const doigt of [false, true]) {
      test(`fiche ouverte, le zoom est peint par lui-même${doigt ? ' (au doigt)' : ''}`, async ({
        browser,
      }) => {
        const contexte = await browser.newContext({
          viewport: { width: largeur, height: 768 },
          hasTouch: doigt,
        })
        const page = await contexte.newPage()
        await ouvrirLaFicheDuGr7(page)
        await expect
          .poll(() =>
            page.evaluate(() =>
              [
                '.maplibregl-ctrl-zoom-in',
                '.maplibregl-ctrl-zoom-out',
                '.maplibregl-ctrl-compass',
              ].filter((s) => {
                const e = document.querySelector(s)
                if (!e) return true
                const r = e.getBoundingClientRect()
                const peint = document.elementFromPoint(
                  r.left + r.width / 2,
                  r.top + r.height / 2,
                )
                return !(peint && e.contains(peint))
              }),
            ),
          )
          .toEqual([])
        await contexte.close()
      })
    }
  })
}

/*
  Revue du sprint 1 (21/10) : le crédit replié « pour la place » se
  redéplie quand la place revient — mais pas s'il a été replié par
  l'utilisateur entre-temps. Le drapeau restait levé : rouvert puis refermé
  au « ⓘ », le crédit se rouvrait tout seul au mouvement suivant de la
  feuille, contre ce que le commentaire du code promettait.
*/
test.describe('crédit replié par l’utilisateur — téléphone, gros texte', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('reste replié quand la feuille bouge', async ({ page }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await fermerLeGuide(page)
    await activerLeGrosTexte(page, true)
    await ouvrirOnglet(page, 'carte')
    const credit = page.locator('.maplibregl-ctrl-attrib')
    const deplie = () =>
      credit.evaluate((e) => e.classList.contains('maplibregl-compact-show'))
    const feuille = page.getByTestId('sidebar')
    const amener = async (position: string) => {
      await expect
        .poll(async () => {
          if ((await feuille.getAttribute('data-position')) === position) return true
          await page.getByTestId('sheet-handle').click({ timeout: 1_000 }).catch(() => undefined)
          return false
        })
        .toBe(true)
    }
    await amener('moitie')
    // La règle l'a replié : il recouvrait « Ma position » ou le zoom.
    await expect.poll(deplie).toBe(false)
    const bouton = page.locator('.maplibregl-ctrl-attrib-button')
    await bouton.click()
    await expect.poll(deplie).toBe(true)
    await bouton.click()
    await expect.poll(deplie).toBe(false)
    await amener('repliee')
    await page.waitForTimeout(400)
    expect(await deplie()).toBe(false)
  })
})
