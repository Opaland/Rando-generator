import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'

test('la précision de suivi GPS reste repliée tant qu’il n’y a rien à régler', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const reglages = page.getByTestId('settings')
  await expect(reglages).not.toHaveAttribute('open', /.*/)

  // Une fois une zone chargée, le réglage a un sujet : la section s'ouvre.
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await expect(reglages).toHaveAttribute('open', /.*/)

  // Et le choix de l'utilisateur prime ensuite sur l'automatisme.
  // Depuis l'issue #174 la section contient un second <details> (la
  // distance exacte) : on vise le sommaire de la section, pas le sien.
  await reglages.locator(':scope > summary').click()
  await expect(reglages).not.toHaveAttribute('open', /.*/)
})

test('la carte garde la place sur les largeurs intermédiaires', async ({
  page,
}) => {
  await mockExternalNetwork(page)

  // Fenêtre réduite / tablette en paysage : la barre latérale ne doit pas
  // manger la moitié de l'écran, la carte est le produit.
  await page.setViewportSize({ width: 900, height: 800 })
  await page.goto('/')
  const barre = page.getByRole('complementary', { name: 'Panneau de contrôle' })
  const etroite = await barre.boundingBox()
  expect(etroite?.width ?? 0).toBeLessThanOrEqual(330)

  // Sur un grand écran, elle retrouve sa largeur confortable.
  await page.setViewportSize({ width: 1400, height: 900 })
  const large = await barre.boundingBox()
  expect(large?.width ?? 0).toBeGreaterThan(360)
})

test('la section Zone est repliée au retour sur l’application', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Tant qu'il n'y a rien de chargé, choisir une zone est la première chose
  // à faire : la section est ouverte.
  const zone = page.getByTestId('zone-section')
  await expect(zone).toHaveAttribute('open', /.*/)

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // Elle reste ouverte : l'utilisateur est peut-être en train d'en essayer
  // plusieurs, et lui replier la liste sous le nez serait pénible.
  await expect(zone).toHaveAttribute('open', /.*/)

  // Au retour sur l'application, la zone vient du cache : on vient voir sa
  // progression, pas faire défiler quatorze départements.
  await page.reload()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await expect(zone).not.toHaveAttribute('open', /.*/)
  // Le nom de la zone active reste lisible, section repliée.
  await expect(zone.locator('summary')).toContainText('PNR du Pilat')
  // Et « Actualiser les tracés » reste accessible sans rien déplier.
  await expect(page.getByTestId('zone-refresh')).toBeVisible()

  // Le choix de l'utilisateur prime ensuite.
  await zone.locator('summary').click()
  await expect(zone).toHaveAttribute('open', /.*/)
})
