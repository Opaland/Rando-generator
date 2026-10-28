import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, mockTilesOk, fermerLeGuide, buildGpx, hasMap, ouvrirOnglet, pilatTroisGr } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * AUDIT_UX.md, constat U6 — la légende occupait 100 px sur les 350 de carte
 * visible sur téléphone, soit 28 %, en permanence, et en haut, là où se
 * trouve le tracé après un cadrage. Six entrées, dont la moitié ne
 * concernait pas la zone affichée.
 *
 * Ce qui est gardé : **la légende ne nomme que ce qui est dessiné**, et
 * disparaît quand il n'y a rien à nommer. Les trois états sont vérifiés —
 * carte vide, zone chargée, trace importée — parce qu'une règle qui ne
 * s'applique qu'à l'un des trois n'est pas la règle.
 */

test.use({ viewport: { width: 390, height: 844 } })

async function ouvrir(page: Page, fixture?: unknown): Promise<boolean> {
  const overpass = await mockExternalNetwork(page)
  if (fixture !== undefined) overpass.setFixture(fixture)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)
  return hasMap(page)
}

test('carte vide : pas de légende du tout', async ({ page }) => {
  test.skip(!(await ouvrir(page)), 'WebGL indisponible')
  await expect(page.getByTestId('map-legend')).toHaveCount(0)
})

test('zone chargée : seuls ses réseaux, et pas les états', async ({ page }) => {
  test.skip(!(await ouvrir(page)), 'WebGL indisponible')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  const legende = page.getByTestId('map-legend')
  await expect(legende).toBeVisible()

  // La fixture du Pilat porte trois réseaux — GR, GRP et PR — et aucun
  // itinéraire local ni personnel. Ce sont donc trois pastilles, pas cinq.
  // Le compte a d'abord été écrit à 1 sur une supposition ; la fixture dit
  // 3, et c'est elle qui a raison.
  await expect(legende.locator('[data-reseau]')).toHaveCount(3)
  for (const reseau of ['GR', 'GRP', 'PR']) {
    await expect(legende.locator(`[data-reseau="${reseau}"]`)).toBeVisible()
  }
  // Et les deux absents restent absents : c'est là que se joue la règle.
  for (const reseau of ['LOCAL', 'PERSO']) {
    await expect(legende.locator(`[data-reseau="${reseau}"]`)).toHaveCount(0)
  }
  // Sans trace importée, tout est restant : la distinction n'apprend rien.
  await expect(page.getByTestId('legende-etats')).toHaveCount(0)
})

/**
 * Issue #594 — le filtre par défaut replie les GR (#322), et la légende les
 * annonçait quand même : en Nouvelle-Calédonie, « GR » en rouge au-dessus
 * d'une carte qui n'en dessinait aucun. Elle lit maintenant le même filtre
 * que la carte, et le GR revient quand on l'affiche.
 */
test('un réseau replié par le filtre n’est pas annoncé', async ({ page }) => {
  test.skip(!(await ouvrir(page, pilatTroisGr())), 'WebGL indisponible')
  // Trois GR : depuis #594 (volet 2), l'unique GR d'une zone n'est plus replié.
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('5 itinéraires', {
    timeout: 15_000,
  })

  const legende = page.getByTestId('map-legend')
  await expect(legende.locator('[data-reseau="PR"]')).toBeVisible()
  await expect(legende.locator('[data-reseau="GR"]')).toHaveCount(0)

  await afficherTousLesReseaux(page)
  await expect(legende.locator('[data-reseau="GR"]')).toBeVisible()
})

/**
 * GR et GRP se confondent en vision deutéranope (ΔE 6,9, issue #360) : la
 * carte s'en distingue déjà par la forme (`trails-base-grp`/`trails-done-grp`,
 * tireté `[4,2]`, `style.ts`), mais la légende ne montrait qu'une pastille
 * pleine — la même règle que « autre » pour le terrain (ligne 73 plus bas),
 * oubliée au troisième endroit où elle s'applique (§4ter). Le témoin de la
 * légende doit ressembler à ce qui est peint sur la carte, pas seulement sa
 * teinte.
 */
test('GRP se distingue par la forme dans la légende, pas seulement la couleur', async ({
  page,
}) => {
  test.skip(!(await ouvrir(page)), 'WebGL indisponible')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  const legende = page.getByTestId('map-legend')
  const grp = legende.locator('[data-reseau="GRP"] span')
  const gr = legende.locator('[data-reseau="GR"] span')
  await expect(grp).toHaveCount(1)

  const grpTiret = await grp.evaluate(
    (el) => getComputedStyle(el).backgroundImage,
  )
  expect(
    grpTiret,
    `pastille GRP : ${grpTiret} — devrait porter un motif répété, comme le fait déjà « autre » pour le terrain`,
  ).toContain('repeating-linear-gradient')

  // GR, lui, reste une couleur pleine : seul GRP porte le tireté sur la carte.
  const grTiret = await gr.evaluate(
    (el) => getComputedStyle(el).backgroundImage,
  )
  expect(grTiret).not.toContain('repeating-linear-gradient')
})

test('des traces sans zone ont leur légende, réduite aux états', async ({
  page,
}) => {
  test.skip(!(await ouvrir(page)), 'WebGL indisponible')
  await ouvrirOnglet(page, 'sorties')
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx', {
    timeout: 15_000,
  })
  await ouvrirOnglet(page, 'carte')

  // Aucun itinéraire chargé : aucune pastille de réseau. Mais « parcouru »
  // et « restant » veulent dire quelque chose dès qu'une trace est là, et la
  // légende n'apparaissait pas du tout dans ce cas.
  const legende = page.getByTestId('map-legend')
  await expect(legende).toBeVisible()
  await expect(legende.locator('[data-reseau]')).toHaveCount(0)
  await expect(page.getByTestId('legende-etats')).toBeVisible()
})

test('trace importée : parcouru et restant apparaissent', async ({ page }) => {
  test.skip(!(await ouvrir(page)), 'WebGL indisponible')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await ouvrirOnglet(page, 'sorties')
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx', {
    timeout: 15_000,
  })
  await ouvrirOnglet(page, 'carte')
  await expect(page.getByTestId('legende-etats')).toBeVisible()
})
