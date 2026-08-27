import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #156 — « 420 m D+ » ne dit pas « facile ».
 *
 * Ce que ce fichier tient : l'appréciation est là où l'on choisit, elle dit
 * sur quoi elle repose, et **elle ne se fait jamais passer pour une
 * cotation** — nous n'en avons ni le droit ni la donnée.
 */
test('la liste et la fiche qualifient l’effort, sans jouer à la cotation', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  // Dans la liste, à côté des chiffres et non à leur place.
  const effortListe = page.getByTestId('itineraire-effort').first()
  await expect(effortListe).toBeVisible()
  await expect(effortListe).toHaveText(/facile|moyen|soutenu/)

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  // Dans la fiche, avec ce sur quoi elle repose.
  const effortFiche = page.getByTestId('detail-effort')
  await expect(effortFiche).toBeVisible()
  await expect(effortFiche).toContainText('Effort estimé')
  await expect(effortFiche).toContainText(/facile|moyen|soutenu/)

  /*
    Le garde-fou, et c'est la raison d'être de ce test : rien ne doit évoquer
    une cotation officielle. `toContainText` lirait aussi ce qui est masqué —
    ici c'est voulu, on cherche l'absence d'un mot dans tout le panneau, y
    compris dans un attribut rendu invisible.
  */
  const fiche = page.getByTestId('itinerary-detail')
  await expect(fiche).not.toContainText(/cotation/i)
  await expect(fiche).not.toContainText(/FFRandonn/i)
})
