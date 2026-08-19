import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

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
  await expect(reglages).toHaveAttribute('open', /.*/)

  // Et le choix de l'utilisateur prime ensuite sur l'automatisme.
  await reglages.locator('summary').click()
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
