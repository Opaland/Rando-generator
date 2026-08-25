import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Le critère de vérification écrit dans l'issue #175, **au nombre qu'elle
 * nomme** : « retrouver une sortie précise parmi huit cents, en moins de
 * trente secondes, sans faire défiler la liste entière ».
 *
 * `historique.spec.ts` cite déjà cette phrase dans son en-tête — et mesure
 * quarante sorties. Quarante tiennent dans une liste qu'on déroule ; huit
 * cents sont exactement le cas que Karim a apporté avec son archive Garmin,
 * et celui pour lequel l'issue a été ouverte. Un test qui cite un nombre et
 * en éprouve un autre affirme plus qu'il ne mesure (CLAUDE.md §1bis).
 *
 * Ce que cette sonde garde, et que l'autre ne peut pas :
 *
 * 1. la recherche **traverse les plis** à cette échelle aussi ;
 * 2. le DOM ne porte pas huit cents lignes — le rendu par fenêtre de
 *    l'issue tient, sinon le défilement d'un téléphone s'effondre ;
 * 3. le plafond par année est **annoncé**, jamais silencieux.
 */

function gpx(nom: string, date: string, rang: number) {
  // Chaque trace suit sa propre latitude : deux archives identiques au point
  // près seraient écartées comme doublons (issue #165).
  const lat = (45.4 + rang * 0.0005).toFixed(6)
  const trkpts = Array.from(
    { length: 6 },
    (_, i) =>
      `<trkpt lat="${lat}" lon="${(4.5 + i * 0.0002).toFixed(6)}"><ele>800</ele></trkpt>`,
  ).join('')
  return {
    name: nom,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<metadata><time>${date}</time></metadata><trk><trkseg>${trkpts}</trkseg></trk></gpx>`,
      'utf-8',
    ),
  }
}

/**
 * Huit cents sorties — l'archive de Karim.
 *
 * **Quatre cents la même année**, et ce n'est pas un caprice de mise en
 * scène. La première version étalait cent sorties sur huit ans : l'année
 * ouverte n'en portait alors que cent, sous le plafond de deux cents, et
 * l'assertion sur le DOM restait verte **même en retirant le rendu par
 * fenêtre**. Elle mesurait le repli des années, pas la fenêtre — encore une
 * assertion verte pour une raison qu'on n'avait pas voulue (§1bis).
 *
 * Quatre cents dans l'année ouverte est aussi le cas réel : quelqu'un qui
 * enregistre tout ne répartit pas ses sorties également sur huit ans.
 */
function archiveGarmin() {
  const fichiers = []
  let rang = 0
  for (let i = 0; i < 400; i += 1) {
    const mois = String((i % 12) + 1).padStart(2, '0')
    const jour = String((i % 28) + 1).padStart(2, '0')
    fichiers.push(
      gpx(
        `2026-sortie-${String(i)}.gpx`,
        `2026-${mois}-${jour}T08:00:00Z`,
        rang++,
      ),
    )
  }
  for (let annee = 2022; annee <= 2025; annee += 1) {
    for (let i = 0; i < 100; i += 1) {
      const mois = String((i % 12) + 1).padStart(2, '0')
      const jour = String((i % 28) + 1).padStart(2, '0')
      fichiers.push(
        gpx(
          `${String(annee)}-sortie-${String(i)}.gpx`,
          `${String(annee)}-${mois}-${jour}T08:00:00Z`,
          rang++,
        ),
      )
    }
  }
  // Celle qu'on cherchera, en 2022 — une année ancienne, donc repliée.
  fichiers.push(gpx('crete-de-la-perdrix.gpx', '2022-09-04T08:00:00Z', rang))
  return fichiers
}

test('retrouver une sortie parmi huit cents, sans dérouler la liste', async ({
  page,
}) => {
  test.slow()
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  await page.getByTestId('gpx-input').setInputFiles(archiveGarmin())
  await expect(page.getByTestId('tracks-compte')).toContainText('801 sorties', {
    timeout: 180_000,
  })

  /*
    Le DOM ne porte pas les quatre cents lignes de l'année ouverte : c'est le
    « rendu par fenêtre » que l'issue demande, et c'est lui qui garde le
    défilement praticable sur un téléphone.

    La borne est `MAX_PAR_ANNEE` plus une marge : elle doit échouer si la
    fenêtre saute, et pas seulement si tout est peint.
  */
  const lignes = await page.getByTestId('tracks-list').locator('li').count()
  expect(
    lignes,
    `${String(lignes)} lignes dans le DOM pour une année de quatre cents sorties : la fenêtre ne tient pas`,
  ).toBeLessThanOrEqual(210)

  // Et le plafond est **annoncé**, jamais silencieux : sans ce bouton, deux
  // cents sorties disparaîtraient sans que rien ne le dise.
  await expect(
    page
      .getByTestId('tracks-list')
      .locator('..')
      .getByRole('button', {
        name: /restantes|afficher/i,
      }),
    'deux cents sorties sont masquées sans que rien ne l’annonce',
  ).toBeVisible()

  // La sortie cherchée est dans une année repliée.
  await expect(
    page.getByTestId('track-toggle-crete-de-la-perdrix.gpx'),
  ).toHaveCount(0)

  const debut = Date.now()
  await page.getByTestId('tracks-recherche').fill('perdrix')
  await expect(
    page.getByTestId('track-toggle-crete-de-la-perdrix.gpx'),
  ).toBeVisible({ timeout: 30_000 })
  const secondes = (Date.now() - debut) / 1_000
  expect(
    secondes,
    `${secondes.toFixed(1)} s pour retrouver une sortie parmi huit cents — l'issue en demande moins de trente`,
  ).toBeLessThan(30)

  await expect(page.getByTestId('tracks-compte')).toContainText('1 sur 801')
})
