import { test, expect } from '@playwright/test'
import { estAlEcran, fermerLeGuide, mockExternalNetwork, ouvrirOnglet } from './helpers.ts'

/**
 * #576, tranché par Cédric le 21/10 : « Affichage » en tête de l'onglet
 * Réglages, déplié.
 *
 * Démonstration du sprint 1, persona Jeanine (76 ans), réseau réel : pour
 * passer en gros texte, l'onglet Réglages s'ouvrait sur « Précision de
 * suivi GPS », puis la sauvegarde, et le réglage vivait au bas du panneau,
 * dans un accordéon replié. Le premier réglage dont Jeanine et Théo ont
 * besoin était le dernier qu'ils trouvaient.
 *
 * Peint, pas présent (§1bis) : `estAlEcran`, sans défiler ni rien déplier.
 */
test.describe('Réglages au téléphone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('le gros texte se touche dès l’ouverture de l’onglet', async ({ page }) => {
    await mockExternalNetwork(page)
    await page.goto('/')
    await fermerLeGuide(page)
    await ouvrirOnglet(page, 'reglages')
    await expect.poll(() => estAlEcran(page, 'gros-texte')).toBe(true)
  })
})
