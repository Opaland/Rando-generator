import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  cocher,
  mockExternalNetwork,
} from './helpers.ts'

/**
 * Issue #174 — le succès n'est pas « trois boutons existent », c'est que le
 * réglage se comprenne sans explication.
 *
 * Ces tests vérifient ce qui est vérifiable ici : que chaque choix dit ce
 * qu'il change en termes de terrain, que la cible se touche, et que la
 * valeur en mètres reste consultable sans jamais mentir. Le reste — Jeanine
 * qui règle sans aide — se mesure en session (E3, docs/PROTOCOLE_TEST.md),
 * pas dans Playwright.
 */
test('chaque choix dit ce qu’il change sur le terrain', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  const niveaux = page.getByTestId('tolerance-niveaux')
  await expect(niveaux).toContainText('Précis')
  await expect(niveaux).toContainText('Normal')
  await expect(niveaux).toContainText('Souple')
  // Le mot seul n'apprend rien : c'est la phrase qui règle le problème.
  await expect(niveaux).toContainText('sous les arbres')
  await expect(niveaux).toContainText('de près')

  // Aucun mot d'algorithme dans le choix lui-même.
  const texte = (await niveaux.textContent()) ?? ''
  expect(texte.toLowerCase()).not.toContain('tolérance')
  expect(texte.toLowerCase()).not.toContain('matching')
})

test('les crans se touchent, et le réglage fin reste accessible', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  // La cible se touche avec des doigts qui ne visent pas bien : c'est
  // l'arthrose de Jeanine autant que le vocabulaire qui motivait l'issue.
  for (const cran of ['precis', 'normal', 'souple']) {
    const boite = await page
      .getByTestId(`tolerance-${cran}`)
      .locator('xpath=ancestor::label[1]')
      .boundingBox()
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  await cocher(page.getByTestId('tolerance-souple'))
  await expect(page.getByTestId('tolerance-detail')).toContainText('100 m')
})

test('une valeur intermédiaire se dit « personnalisée », pas « précise »', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  await page.getByTestId('tolerance-detail').click()
  await page.getByTestId('tolerance-slider').fill('35')

  // 35 m n'est aucun des trois crans : le présenter comme l'un d'eux
  // mentirait sur ce qui est réellement réglé.
  await expect(page.getByTestId('tolerance-detail')).toContainText(
    'personnalisé',
  )
  for (const cran of ['precis', 'normal', 'souple']) {
    await expect(page.getByTestId(`tolerance-${cran}`)).not.toBeChecked()
  }
})
