import { test, expect } from '@playwright/test'

/**
 * Sans JavaScript, la page est vide : tout le rendu se fait dans le
 * navigateur. Un visiteur qui l'a désactivé — ou un robot d'indexation
 * rudimentaire — n'avait alors aucun moyen de savoir ce que fait ce site.
 */
test.use({ javaScriptEnabled: false })

test('la page dit ce qu’elle fait même sans JavaScript', async ({ page }) => {
  await page.goto('/')

  const secours = page.getByRole('main')
  await expect(secours).toContainText('Sentiers')
  await expect(secours).toContainText('itinéraires de randonnée balisés')
  // La promesse de confidentialité est ce qui distingue le projet : elle doit
  // figurer là aussi, pas seulement dans l'application.
  await expect(secours).toContainText('ne sont envoyées nulle part')
  await expect(secours).toContainText('Activez JavaScript')

  // Et l'application elle-même n'a rien affiché : c'est bien le repli qu'on lit.
  await expect(page.getByTestId('zone-pilat')).toHaveCount(0)
})
