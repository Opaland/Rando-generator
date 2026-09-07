import { test, expect } from '@playwright/test'
import {
  buildGpx,
  estAlEcran,
  mockExternalNetwork,
} from './helpers.ts'

/**
 * L'histogramme de « Mes sorties » dit ce qu'il compte (issue #503).
 *
 * Retour de Cédric, 04/09 : « une fois que j'ai enregistré, j'ai une barre
 * rouge qui apparaît. Je ne sais pas à quoi correspond cette barre. Est-ce
 * que c'est la distance ? Est-ce que c'est des tours ? »
 *
 * Le graphique portait bien un `aria-label` disant « Distance par mois ».
 * **Un `aria-label` n'est pas peint** : pour qui regarde l'écran, il
 * n'existe pas. C'est le §1bis pris par l'autre bout — on croyait avoir
 * expliqué parce qu'un attribut le disait.
 *
 * D'où la mesure ici : ce n'est pas « le texte est dans le DOM », c'est
 * « c'est bien la légende qui est peinte à cet endroit », par
 * `document.elementFromPoint` (helper `estAlEcran`).
 */
test('la légende de l’histogramme est peinte, et porte une échelle chiffrée', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Une seule sortie : c'est l'état de tout nouvel arrivant, et c'était le
  // moins lisible — une barre, un mois écrit, rien qui relie les deux.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'pilat.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('history-totals')).toContainText('1 sortie')

  const legende = page.getByTestId('history-chart-legende')
  await expect(legende).toContainText('Distance par mois')
  // Une échelle, sinon la barre ne dit toujours pas si elle vaut trois
  // kilomètres ou trois cents. On vise un nombre suivi de son unité, pas la
  // phrase entière : le libellé du mois dépend de la date de la trace.
  await expect(legende).toContainText(/\d+([.,]\d+)?\s*km/)

  // La mesure qui compte : peinte, pas seulement présente. On l'amène
  // d'abord dans la fenêtre — « Mes sorties » est en bas du panneau, et la
  // question posée ici est l'occultation, pas la position du défilement
  // (celle-là est le sujet de #497, et elle se pose pour une alerte, pas
  // pour un graphique qu'on va consulter).
  await page.getByTestId('history-chart-legende').scrollIntoViewIfNeeded()
  await expect
    .poll(() => estAlEcran(page, 'history-chart-legende'), { timeout: 5_000 })
    .toBe(true)
})
