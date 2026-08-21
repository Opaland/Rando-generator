import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * Issue #173 — sur quatorze personas, deux échouent totalement en autonomie.
 *
 * La preuve finale n'est pas ici : c'est Théo et Jeanine menant chacun une
 * tâche complète, sans aide (sessions E3 et E4, docs/PROTOCOLE_TEST.md).
 * Ces tests vérifient ce qui est vérifiable par une machine — que le mode
 * simple cache sans amputer, que le gros texte atteint tout, et qu'à 200 %
 * rien n'est tronqué ni superposé sur un écran de 360 px.
 */

async function avecUneZoneEtUneTrace(page: Page): Promise<void> {
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx')
}

test('le mode simple cache le jargon sans retirer la tâche', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await avecUneZoneEtUneTrace(page)

  await page.getByTestId('mode-affichage').locator(':scope > summary').click()
  await page.getByTestId('mode-simple').check()

  // Ce qui répond à « montre où on a marché » reste : la carte, les traces,
  // le grand chiffre, et de quoi charger une zone.
  await expect(page.getByTestId('map')).toBeVisible()
  await expect(page.getByTestId('global-pct')).toBeVisible()
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx')
  await expect(page.getByTestId('gpx-input')).toBeAttached()
  await expect(page.getByTestId('zone-pilat')).toBeAttached()

  // Ce qui suppose du vocabulaire ou un projet disparaît.
  await expect(page.getByTestId('settings')).toHaveCount(0)
  await expect(page.getByTestId('backup')).toHaveCount(0)
  await expect(page.getByTestId('itinerary-list')).toHaveCount(0)

  // Et rien n'est perdu : le retour est immédiat.
  await page.getByTestId('mode-complet').check()
  await expect(page.getByTestId('settings')).toHaveCount(1)
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx')
})

test('le mode choisi survit au rechargement', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('mode-affichage').locator(':scope > summary').click()
  await page.getByTestId('mode-simple').check()
  await expect(page.getByTestId('settings')).toHaveCount(0)

  // Quelqu'un règle le mode pour un proche : il doit tenir.
  await page.reload()
  await expect(page.getByTestId('settings')).toHaveCount(0)
  await expect(page.getByTestId('mode-simple')).toBeChecked()
})

test('le gros texte agrandit tout, y compris hors du panneau', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const tailleAvant = await page.evaluate(
    () =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      ),
  )

  await page.getByTestId('mode-affichage').locator(':scope > summary').click()
  await page.getByTestId('gros-texte').check()

  const tailleApres = await page.evaluate(
    () =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      ),
  )
  expect(tailleApres).toBeGreaterThan(tailleAvant)

  // La bascule se pose sur la racine : les dialogues, qui sortent de l'arbre
  // du panneau, sont agrandis eux aussi.
  await page.getByTestId('about-open').click()
  const dialogue = page.getByTestId('about-dialog')
  await expect(dialogue).toBeVisible()
  const taillePanneau = await dialogue.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).fontSize),
  )
  expect(taillePanneau).toBeGreaterThanOrEqual(tailleApres * 0.9)
})

test('à 200 %, rien ne déborde sur un écran de 360 px', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await avecUneZoneEtUneTrace(page)

  await page.getByTestId('mode-affichage').locator(':scope > summary').click()
  await page.getByTestId('gros-texte').check()
  // Le gros texte s'ajoute au zoom du navigateur, il ne le remplace pas :
  // quelqu'un qui a déjà réglé son téléphone à 200 % garde ce réglage.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })

  // Aucun débordement horizontal : c'est ce qui rend une page inutilisable
  // en grossissement, bien avant l'illisibilité.
  const debordement = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(debordement).toBeLessThanOrEqual(1)

  // Et surtout le panneau lui-même : il défile verticalement, jamais
  // latéralement. C'est là que le défaut se cachait — le document ne
  // débordait pas, mais l'aside portait 612 px de contenu dans 360.
  const panneau = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    return aside
      ? { scroll: aside.scrollWidth, client: aside.clientWidth }
      : null
  })
  expect(panneau).not.toBeNull()
  expect(panneau!.scroll).toBeLessThanOrEqual(panneau!.client + 1)

  // Le grand chiffre reste entier dans le cadre qui le porte.
  const pct = page.getByTestId('global-pct')
  await expect(pct).toBeVisible()
  const coupe = await pct.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  )
  expect(coupe).toBe(false)
})

test('les étoiles d’une sortie ne sont pas un score', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await avecUneZoneEtUneTrace(page)

  await page
    .getByTestId('tracks-list')
    .getByRole('button', { name: /sortie\.gpx/ })
    .first()
    .click()

  const etoiles = page.getByTestId('outing-etoiles')
  await expect(etoiles).toBeVisible({ timeout: 10_000 })
  // Trois au plus, jamais un chiffre à battre : pas de total, pas de rang,
  // pas de comparaison.
  const valeur = Number(await etoiles.getAttribute('data-etoiles'))
  expect(valeur).toBeGreaterThanOrEqual(0)
  expect(valeur).toBeLessThanOrEqual(3)
  const texte = (await etoiles.textContent()) ?? ''
  expect(texte).not.toMatch(/points?|score|record|classement/i)
})

test('le mode simple ne peut pas enfermer, ni faire perdre une trace', async ({
  page,
}) => {
  // Revue du sprint 3 : un mode réduit dont on ne sort pas est un piège, et
  // un mode qui laisse déposer une trace invisible en est un autre.
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('mode-affichage').locator(':scope > summary').click()
  await page.getByTestId('mode-simple').check()

  // On arrive en mode simple sans rien avoir : la tâche complète doit
  // rester possible, de bout en bout.
  await avecUneZoneEtUneTrace(page)
  await expect(page.getByTestId('global-pct')).toBeVisible()

  // La sortie du mode reste atteignable, et rend tout ce qui était caché.
  await expect(page.getByTestId('mode-affichage')).toBeVisible()
  await page.getByTestId('mode-complet').check()
  await expect(page.getByTestId('settings')).toHaveCount(1)
  await expect(page.getByTestId('backup')).toHaveCount(1)

  // Et la trace déposée en mode simple est bien là, enregistrée.
  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText('sortie.gpx')
})

test('la sauvegarde reste exportable après un passage en mode simple', async ({
  page,
}) => {
  // Le mode simple cache la section « Sauvegarde ». Si quelqu'un y reste et
  // que ses données ne sont plus exportables, on a créé une impasse.
  await mockExternalNetwork(page)
  await page.goto('/')
  await avecUneZoneEtUneTrace(page)

  await page.getByTestId('mode-affichage').locator(':scope > summary').click()
  await page.getByTestId('mode-simple').check()
  await expect(page.getByTestId('backup')).toHaveCount(0)

  await page.getByTestId('mode-complet').check()
  await page.getByTestId('backup').locator(':scope > summary').click()
  await expect(page.getByTestId('backup-export')).toBeEnabled()
})
