import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx, estAlEcran } from './helpers.ts'
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
  await afficherTousLesReseaux(page)
}

test('depuis la carte, chaque onglet montre son contenu', async ({ page }) => {
  await avecUneZone(page)
  // Ce qu'on vise dans chaque onglet est **ce qui l'ouvre**, et non une
  // section quelconque : c'est la première chose que la personne doit voir.
  //
  // « Sorties » visait `gpx-dropzone`. Depuis que l'enregistrement ouvre cet
  // onglet (#152), le dépôt de fichiers est descendu : mesuré à 390 × 844,
  // feuille à mi-hauteur, sa boîte va de 711 à 891 alors que la feuille
  // s'arrête à 788 — son centre tombe treize pixels sous le bord. Le test
  // ne mesurait donc plus un invariant mais un coup de dé, et il l'a joué
  // en intégration continue : rouge trois fois de suite après avoir été
  // vert autant.
  // « Réglages » visait `settings`, le bloc `<details>` entier de la
  // précision GPS — ouvert par défaut dès qu'il y a des données, donc haut de
  // 707 px. Mesuré à 390 × 844, feuille à mi-hauteur (349 px de haut) : son
  // centre tombe à plus de 400 px sous le bas de la feuille, jamais peint.
  //
  // Trouvé le 29/09 en corrigeant #171 (repli forcé sur « Carte », voir
  // maquetteOnglets.ts) : ce test passait quand même, parce que l'ancienne
  // version de « Carte » laissait la feuille dans sa position d'avant, et le
  // détour par plusieurs clics réels sur la poignée (`replier`) prenait assez
  // de temps pour que `expect.poll` capture un instant transitoire où la
  // feuille était encore à « pleine » — pas l'état final, réellement à
  // « moitié ». Même défaut que « Sorties » ci-dessus, sur un autre onglet :
  // un test qui passe pour une raison qu'on n'a pas voulue n'est pas un test
  // (CLAUDE.md §1bis). Cible corrigée sur le titre de l'accordéon, en haut du
  // contenu quel que soit son état ouvert/fermé.
  const attendu = {
    sorties: 'enregistreur',
    progression: 'global-pct',
    reglages: 'settings-title',
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
    /*
      Le délai est **au-dessus du pire cas observé, pas du cas ordinaire** —
      le même raisonnement que le `globalTimeout` de `playwright.config.ts`.

      La convergence était juste ; c'est son budget qui ne l'était pas. Cinq
      secondes (le défaut) suffisent isolément — mesuré vert trois fois de
      suite — et pas en suite complète, où la machine peint plus lentement :
      l'onglet « réglages » est tombé une fois, le 27/08. Une porte qui
      rougit sur la lenteur d'une machine ne mesure plus le code.
    */
    await expect
      .poll(() => estAlEcran(page, cible), {
        message: `l’onglet « ${onglet} » n’a rien montré à l’écran`,
        timeout: 15_000,
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

test('« Carte » replie la feuille : son contenu est derrière, pas caché par un autre onglet', async ({
  page,
}) => {
  await avecUneZone(page)
  const feuille = page.getByTestId('sidebar')
  await page.getByTestId('onglet-sorties').click()
  while ((await feuille.getAttribute('data-position')) !== 'pleine') {
    await page.getByTestId('sheet-handle').click()
  }
  await page.getByTestId('onglet-carte').click()
  // Revu le 29/09 (audit UI, #171) : laisser la feuille à « pleine » masquait
  // la carte à 93 % (mesuré 7 % visible, 56 px sur 855, Pixel 7) dès qu'un
  // autre onglet avait été déplié en grand — exactement l'onglet qui n'existe
  // que pour montrer la carte. Le coût qu'on redoutait (perdre sa place dans
  // la liste des zones) est réel mais moindre, et ne concerne que « Carte »
  // elle-même, pas un aller-retour depuis un autre onglet.
  await expect
    .poll(() => feuille.getAttribute('data-position'), { timeout: 15_000 })
    .toBe('repliee')
})

test('« pleine » ne réserve le haut que sur « Carte », qui a quelque chose dessous', async ({
  page,
}) => {
  await avecUneZone(page)
  const feuille = page.getByTestId('sidebar')

  await page.getByTestId('onglet-carte').click()
  while ((await feuille.getAttribute('data-position')) !== 'pleine') {
    await page.getByTestId('sheet-handle').click()
  }
  // La transition CSS dure 0,2 s (§1bis) : on la laisse finir avant de
  // mesurer, comme carte.spec.ts et loading.spec.ts le font déjà.
  await page.waitForTimeout(300)
  const hauteurCarte = (await feuille.boundingBox())?.height ?? 0

  // Rester à « pleine » en changeant d'onglet (déjà garanti par le test
  // ci-dessus) : aucun second cycle de poignée n'est nécessaire.
  await page.getByTestId('onglet-sorties').click()
  await expect(feuille).toHaveAttribute('data-position', 'pleine')
  await page.waitForTimeout(300)
  const hauteurSorties = (await feuille.boundingBox())?.height ?? 0

  // « Sorties » n'a rien derrière la feuille : les 24 px réservés en haut
  // pour apercevoir la carte sous « Carte » n'ont aucune raison de s'imposer
  // aussi ici.
  expect(hauteurSorties).toBeGreaterThan(hauteurCarte + 15)
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

test('un balayage sur la barre d’onglets change d’onglet (sprint 3)', async ({
  page,
}) => {
  await avecUneZone(page)
  // `avecUneZone` affiche tous les réseaux, ce qui passe par « Progression »
  // (afficherTousLesReseaux) : repartir d'un onglet connu plutôt que de
  // supposer lequel ce détour a laissé actif.
  await page.getByTestId('onglet-carte').click()
  const barre = page.getByTestId('barre-onglets')
  const boite = await barre.boundingBox()
  if (!boite) throw new Error('barre-onglets introuvable')
  const y = boite.y + boite.height / 2

  // Depuis « Carte » : balayer vers la gauche amène « Sorties », le
  // suivant dans l'ordre affiché par la barre.
  await page.mouse.move(boite.x + boite.width - 20, y)
  await page.mouse.down()
  await page.mouse.move(boite.x + 20, y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('onglet-sorties')).toHaveAttribute(
    'aria-current',
    'page',
  )

  // Et balayer vers la droite revient en arrière.
  await page.mouse.move(boite.x + 20, y)
  await page.mouse.down()
  await page.mouse.move(boite.x + boite.width - 20, y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('onglet-carte')).toHaveAttribute(
    'aria-current',
    'page',
  )

  // Et un simple tap, sans déplacement, continue de fonctionner comme avant
  // : le geste ne doit rien retirer à l'existant.
  await page.getByTestId('onglet-reglages').click()
  await expect(page.getByTestId('onglet-reglages')).toHaveAttribute(
    'aria-current',
    'page',
  )
})
