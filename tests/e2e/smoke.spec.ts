import { test, expect } from '@playwright/test'

test('la page se charge et affiche le titre', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Sentiers', exact: true }),
  ).toBeVisible()
})
