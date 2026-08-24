import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Issue #178 — la confidentialité est écrite partout, ressentie nulle part.
 *
 * Le panneau affirme deux choses. Chacune a son test ici, parce qu'une
 * promesse affichée en gros sans vérification derrière serait pire que la
 * même promesse écrite en petit : on passerait d'une approximation écrite à
 * une approximation mise en scène.
 */

/** Une trace aux coordonnées reconnaissables entre mille. */
const LAT_TEMOIN = '45.4176543'
const LON_TEMOIN = '4.5187654'

function gpxTemoin(): { name: string; mimeType: string; buffer: Buffer } {
  const trkpts = Array.from(
    { length: 30 },
    (_, i) =>
      `<trkpt lat="${LAT_TEMOIN}" lon="${(Number(LON_TEMOIN) + i * 0.0002).toFixed(7)}"><ele>800</ele></trkpt>`,
  ).join('')
  return {
    name: 'temoin.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<metadata><time>2026-06-15T08:00:00Z</time></metadata>` +
        `<trk><trkseg>${trkpts}</trkseg></trk></gpx>`,
      'utf-8',
    ),
  }
}

test('aucune requête ne transporte les points de la trace importée', async ({
  page,
}) => {
  // Tout ce qui sort est relevé au niveau du navigateur, avant les mocks :
  // se fier au code de l'application pour prouver ce que fait le code de
  // l'application ne prouverait rien.
  const sorties: string[] = []
  page.on('request', (requete) => {
    sorties.push(requete.url() + ' ' + (requete.postData() ?? ''))
  })

  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  await page.getByTestId('gpx-input').setInputFiles(gpxTemoin())
  await expect(page.getByTestId('tracks-list')).toContainText('temoin.gpx')

  // On pousse l'application à parler au réseau autant que possible : c'est
  // là que la trace fuirait si elle devait fuir.
  await page.getByTestId('track-toggle-temoin.gpx').click()
  await page.waitForTimeout(1500)

  const fuites = sorties.filter(
    (s) => s.includes(LAT_TEMOIN) || s.includes(LON_TEMOIN),
  )
  expect(fuites, `requêtes contenant les points de la trace :\n${fuites.join('\n')}`).toEqual([])
  // Et le relevé n'est pas vide : sans cela le test passerait pour la
  // mauvaise raison — celle d'une page qui n'a rien fait.
  expect(sorties.length).toBeGreaterThan(5)
})

test('le compteur montre ce qui est sorti, service par service', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  await page.getByRole('button', { name: 'À propos' }).click()
  const panneau = page.getByTestId('sorties-reseau')
  await expect(panneau).toBeVisible()

  // Un chiffre, pas une formule rassurante.
  const total = Number(await page.getByTestId('sorties-total').textContent())
  expect(total).toBeGreaterThan(0)
  // Et sa décomposition nomme les mêmes services qu'« À propos ».
  await expect(panneau).toContainText('Tracés des sentiers')
  await expect(panneau).toContainText('overpass-api.de')
  // Rien d’anormal à signaler tant que l’application s’en tient à sa liste.
  await expect(page.getByTestId('sorties-inconnues')).toHaveCount(0)
})

/**
 * Une dépendance qui se mettrait à téléphoner n'arrive **plus jusqu'au
 * compteur** : le navigateur la refuse avant (24/08).
 *
 * Ce test affirmait autre chose, et il avait raison de le faire tant que
 * l'application était servie par GitHub Pages, qui ne permet aucun en-tête.
 * Le compteur était alors la seule défense : il ne pouvait pas empêcher
 * l'appel, seulement le montrer.
 *
 * Depuis que `deploy/csp.conf` est servie — en production par nginx, en
 * prévisualisation par Vite, donc ici — il y a deux défenses, et la première
 * est plus forte que la seconde :
 *
 * 1. **la politique refuse**, avant que la requête ne parte ;
 * 2. **le compteur dénonce**, pour ce que la politique laisse passer.
 *
 * Ce test garde la première, qui est celle qui protège vraiment. La seconde
 * garde son propre test — `tests/unit/journalSortant.test.ts`, « avoue une
 * destination qu'il ne sait pas classer » — et les deux listes sont
 * comparées dans les deux sens par `tests/unit/csp.test.ts` : un hôte permis
 * par la politique mais inconnu du compteur ne peut pas exister.
 *
 * Écrire ici « le compteur dénonce » aurait été maintenir une affirmation
 * qui ne s'éprouve plus (CLAUDE.md §4bis) : la requête n'atteint jamais
 * l'observateur, et le test serait passé pour une raison qu'on n'a pas
 * voulue.
 */
test('une destination non répertoriée est refusée par le navigateur', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // La doublure répondrait — c'est bien le navigateur, et non l'absence de
  // serveur en face, qui doit faire échouer l'appel.
  await page.route('https://analytics.example.com/**', (route) =>
    route.fulfill({ status: 200, body: '{}' }),
  )
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  const refus = await page.evaluate(async () => {
    try {
      await fetch('https://analytics.example.com/collect?x=1')
      return 'passée'
    } catch (erreur) {
      return erreur instanceof TypeError ? 'refusée' : 'autre'
    }
  })

  expect(
    refus,
    'la politique de sécurité doit refuser un hôte non déclaré',
  ).toBe('refusée')
})
