import { test, expect } from '@playwright/test'
import { mockExternalNetwork, openDetailFromMap } from './helpers.ts'

/**
 * Une sauvegarde forgée ne doit pas poser un `javascript:` dans un `href`.
 *
 * Trouvé par la revue globale du 25/08. `lienWeb` est validé **à la lecture
 * du réseau** — `boucles.ts` n'accepte que ce qui commence par `http(s)://`,
 * ancre comprise. Mais l'import d'une sauvegarde ne repasse pas par là :
 * `estItineraire` vérifie l'identifiant et les coordonnées, jamais les
 * détails. Mesuré : `javascript:alert(document.cookie)` traverse la
 * validation intact.
 *
 * Ce test **mesure ce que le navigateur en fait**, plutôt que de supposer
 * que React protège. On ne délègue pas une question de sécurité au
 * comportement non contractuel d'une bibliothèque.
 *
 * L'application est entièrement locale et garde des traces personnelles en
 * IndexedDB : une exécution de script ici, c'est la promesse centrale du
 * produit qui tombe.
 */

function sauvegardeForgee(): { name: string; mimeType: string; buffer: Buffer } {
  const contenu = {
    format: 'sentiers-sauvegarde',
    version: 1,
    exportedAt: '2026-08-25T00:00:00Z',
    tracks: [],
    customItineraries: [
      {
        osmRelationId: 4242,
        ref: null,
        name: 'Boucle forgée',
        network: 'LOCAL',
        totalMeters: 1_000,
        fetchedAt: '2026-08-25T00:00:00Z',
        ways: [
          {
            osmWayId: 4242,
            coords: [
              [4.5, 45.42],
              [4.51, 45.42],
            ],
          },
        ],
        details: {
          source: 'Forgé',
          commune: null,
          difficulte: null,
          temps: null,
          denivele: null,
          descriptif: null,
          lienWeb: 'javascript:alert(document.cookie)',
        },
      },
    ],
    parcoursDeclares: [],
  }
  return {
    name: 'sauvegarde.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(contenu), 'utf-8'),
  }
}

test('un lien forgé dans une sauvegarde ne devient pas exécutable', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('backup').locator('summary').click()
  await page.getByTestId('backup-input').setInputFiles(sauvegardeForgee())
  await expect(page.getByTestId('backup-message')).toBeVisible({
    timeout: 20_000,
  })

  await openDetailFromMap(page, 4.505, 45.42)
  await expect(page.getByTestId('itinerary-detail')).toContainText(
    'Boucle forgée',
  )

  // Le lien peut être absent — c'est même la bonne réponse. S'il est là, son
  // `href` ne doit en aucun cas porter un schéma exécutable.
  const liens = page.getByTestId('itinerary-detail').locator('a[href]')
  const nombre = await liens.count()
  for (let i = 0; i < nombre; i += 1) {
    const href = (await liens.nth(i).getAttribute('href')) ?? ''
    expect(
      href.toLowerCase().startsWith('javascript:'),
      `un href exécutable est posé dans le DOM : « ${href} »`,
    ).toBe(false)
  }
})
