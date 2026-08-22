import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx, estAlEcran } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * AUDIT_UX.md, constat U3 — changer d'onglet ne montrait pas l'onglet.
 *
 * Mesuré avant correction : feuille repliée à 52 px pour regarder la carte,
 * on touche « Progression », la feuille reste à 52 px. L'onglet s'allumait,
 * l'écran ne bougeait pas.
 *
 * Ce qui est gardé ici est l'invariant plutôt que la mécanique : **après un
 * changement d'onglet, on voit quelque chose de cet onglet**. Une future
 * façon de ranger les sections rendra ce test rouge si elle laisse un onglet
 * sans rien à l'écran.
 */

test.use({ viewport: { width: 390, height: 844 } })

async function replier(page: Page): Promise<void> {
  const feuille = page.getByTestId('sidebar')
  let position = await feuille.getAttribute('data-position')
  // Trois positions en cycle : au plus trois touchers pour atteindre l'une.
  for (let i = 0; i < 3 && position !== 'repliee'; i++) {
    await page.getByTestId('sheet-handle').click()
    position = await feuille.getAttribute('data-position')
  }
  expect(position).toBe('repliee')
}

async function avecUneZone(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('onboarding-fermer').click()
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
}

test('depuis la carte, chaque onglet montre son contenu', async ({ page }) => {
  await avecUneZone(page)
  const attendu = {
    sorties: 'gpx-dropzone',
    progression: 'global-pct',
    reglages: 'settings',
  } as const

  for (const [onglet, cible] of Object.entries(attendu)) {
    // On repart à chaque fois du geste réel : regarder la carte, puis
    // toucher un onglet. C'est cet enchaînement-là qui était cassé.
    await page.getByTestId('onglet-carte').click()
    await replier(page)
    await page.getByTestId(`onglet-${onglet}`).click()
    // Pas `toBeVisible` : un élément écrêté par la feuille repliée le passe
    // sans broncher. On demande au navigateur ce qu'il peint à cet endroit.
    //
    // Et par `expect.poll` plutôt qu'une mesure unique : la feuille a une
    // transition de 0,2 s sur sa hauteur, et une photographie prise pendant
    // l'animation ne dit rien de l'état final. La première version de ce
    // test mesurait une feuille de 117 px là où elle en fait 405.
    await expect
      .poll(() => estAlEcran(page, cible), {
        message: `l’onglet « ${onglet} » n’a rien montré à l’écran`,
      })
      .toBe(true)
  }
})

test('changer d’onglet ne referme jamais ce qui est ouvert', async ({ page }) => {
  await avecUneZone(page)
  const feuille = page.getByTestId('sidebar')
  await page.getByTestId('onglet-progression').click()
  // On déplie en grand pour lire.
  while ((await feuille.getAttribute('data-position')) !== 'pleine') {
    await page.getByTestId('sheet-handle').click()
  }
  await page.getByTestId('onglet-sorties').click()
  expect(await feuille.getAttribute('data-position')).toBe('pleine')
  await page.getByTestId('onglet-progression').click()
  expect(await feuille.getAttribute('data-position')).toBe('pleine')
})

test('« Carte » ne bouge pas la feuille : son contenu est derrière', async ({
  page,
}) => {
  await avecUneZone(page)
  const feuille = page.getByTestId('sidebar')
  await page.getByTestId('onglet-sorties').click()
  while ((await feuille.getAttribute('data-position')) !== 'pleine') {
    await page.getByTestId('sheet-handle').click()
  }
  await page.getByTestId('onglet-carte').click()
  // Perdre sa place dans la liste des zones parce qu'on a fait un
  // aller-retour ne se rattrape pas ; la poignée, elle, est à un toucher.
  expect(await feuille.getAttribute('data-position')).toBe('pleine')
})

test('le défilement de la feuille repart du haut', async ({ page }) => {
  await avecUneZone(page)
  await page.getByTestId('onglet-sorties').click()
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx', {
    timeout: 15_000,
  })
  const feuille = page.getByTestId('sidebar')
  while ((await feuille.getAttribute('data-position')) !== 'pleine') {
    await page.getByTestId('sheet-handle').click()
  }
  await feuille.evaluate((e) => {
    e.scrollTop = e.scrollHeight
  })
  expect(await feuille.evaluate((e) => e.scrollTop)).toBeGreaterThan(0)

  await page.getByTestId('onglet-progression').click()
  expect(await feuille.evaluate((e) => e.scrollTop)).toBe(0)
})
