import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockTilesOk, fermerLeGuide } from './helpers.ts'

/**
 * Issue #206 — retrouver une sortie par la zone où on l'a importée.
 *
 * L'issue s'arrêtait sur une question de produit : retrouver un *lieu*
 * après coup demande du géocodage inverse, donc d'envoyer les coordonnées
 * de chaque sortie à un tiers. Pour huit cents sorties, c'est huit cents
 * positions de départ transmises — exactement ce que Sentiers refuse.
 *
 * Ce qui est livré n'est donc pas « le lieu » mais **la zone qui était
 * chargée au moment de l'import**, connue de l'application, sans réseau.
 * Le test vérifie les deux faces : ce que ça donne, et ce que ça ne donne
 * pas.
 */
const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>s</name><trkseg>
    <trkpt lat="45.400000" lon="4.500000"><time>2026-06-15T08:00:00Z</time></trkpt>
    <trkpt lat="45.400000" lon="4.510000"><time>2026-06-15T09:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

test('une trace importée retient la zone, et se retrouve par elle', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie-du-jour.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(GPX, 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText(
    'sortie-du-jour.gpx',
    { timeout: 15_000 },
  )

  // Ce que la liste montre : la zone, nommée pour ce qu'elle est.
  const zone = page.getByTestId('track-zone-sortie-du-jour.gpx')
  await expect(zone).toBeVisible()
  await expect(zone).toContainText(/importée depuis/i)
  await expect(zone).toContainText(/pilat/i)

  /*
    Et ce qu'elle ne dit pas : le mot « lieu » ne doit apparaître nulle
    part sur cette ligne. Une zone n'est pas un lieu de départ, et
    l'appeler ainsi serait la promesse que l'issue refuse de faire.
  */
  await expect(zone).not.toContainText(/\blieu\b/i)
})

test('la recherche de l’historique trouve par la zone', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })

  /*
    Trente sorties, parce que le champ de recherche n'apparaît qu'à partir
    de `SEUIL_GROUPEMENT` — en dessous, une liste tient sous le pouce et un
    champ de plus ne rangerait rien. Chercher à en importer une seule et
    s'étonner de ne pas trouver le champ, c'est ce qu'a fait la première
    version de ce test.
  */
  await page.getByTestId('gpx-input').setInputFiles(
    Array.from({ length: 30 }, (_, i) => ({
      name: `sortie-${String(i).padStart(2, '0')}.gpx`,
      mimeType: 'application/gpx+xml',
      /*
        Chaque trace doit être **distincte** : l'empreinte écarte les
        doublons, et `i % 10` n'en donnait que dix — vingt étaient mises de
        côté, la liste restait sous le seuil, et le champ n'apparaissait pas.
        Le test cherchait un champ que l'application avait raison de cacher.
      */
      buffer: Buffer.from(
        GPX.replace('4.510000', `4.5${String(100 + i)}00`),
        'utf-8',
      ),
    })),
  )
  await expect(page.getByTestId('tracks-list')).toContainText('sortie-00.gpx', {
    timeout: 30_000,
  })

  const champ = page.getByTestId('tracks-recherche')
  await expect(champ).toBeVisible()
  // Le champ annonce ce qu'il sait chercher : sans ça, personne n'essaiera.
  await expect(champ).toHaveAttribute('placeholder', /zone/i)

  /*
    On compte des éléments plutôt que de lire le texte du panneau.
    `toContainText` lit le `textContent`, `display: none` compris (§1bis) —
    et à trente sorties la liste est repliée par année : le nom resterait
    dans le DOM d'un groupe fermé, et l'assertion négative serait fausse
    sans que le filtre y soit pour rien.
  */
  await champ.fill('pilat')
  await expect(page.getByTestId('track-toggle-sortie-00.gpx')).toHaveCount(1)

  await champ.fill('bretagne')
  await expect(page.getByTestId('track-toggle-sortie-00.gpx')).toHaveCount(0)
})
