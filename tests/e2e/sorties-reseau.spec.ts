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

test('une destination non répertoriée est dénoncée, pas absorbée', async ({
  page,
}) => {
  // C'est ce cas qui donne sa valeur au compteur. S'il rangeait l'inconnu
  // dans « divers », il rassurerait sans informer — et deviendrait faux le
  // jour où une dépendance ouvrirait un canal que personne n'a voulu.
  await mockExternalNetwork(page)
  await page.route('https://analytics.example.com/**', (route) =>
    route.fulfill({ status: 200, body: '{}' }),
  )
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Une dépendance qui se mettrait à téléphoner : l'appel passe par le
  // `fetch` de la page, donc par l'observateur.
  await page.evaluate(async () => {
    await fetch('https://analytics.example.com/collect?x=1')
  })

  await page.getByRole('button', { name: 'À propos' }).click()
  const alerte = page.getByTestId('sorties-inconnues')
  await expect(alerte).toBeVisible()
  await expect(alerte).toContainText('analytics.example.com')
})
