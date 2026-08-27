import { test, expect } from '@playwright/test'
import { gunzipSync } from 'node:zlib'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Sauvegarde complète (issue #132).
 *
 * Le vrai test n'est pas « le bouton produit un fichier » : c'est « je change
 * d'appareil et je retrouve mes sorties ». On simule l'appareil neuf en
 * effaçant le stockage du navigateur, puis on restaure.
 */
async function telecharger(page: import('@playwright/test').Page) {
  const attente = page.waitForEvent('download')
  await page.getByTestId('backup-export').click()
  const fichier = await attente
  const flux = await fichier.createReadStream()
  const morceaux: Buffer[] = []
  for await (const morceau of flux) morceaux.push(morceau as Buffer)
  return { fichier, contenu: Buffer.concat(morceaux) }
}

test('une sauvegarde s’enregistre, et se relit sur un appareil vierge', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  await page.getByTestId('backup').locator('summary').click()
  const { fichier, contenu } = await telecharger(page)

  expect(fichier.suggestedFilename()).toMatch(
    /^sauvegarde-sentiers-\d{4}-\d{2}-\d{2}\.json\.gz$/,
  )
  // Un vrai gzip, qui contient un vrai JSON — vérifiable hors de
  // l'application, ce qui est tout l'intérêt du format.
  expect([...contenu.subarray(0, 2)]).toEqual([0x1f, 0x8b])
  const json = JSON.parse(gunzipSync(contenu).toString('utf-8')) as {
    tracks: { filename: string }[]
    settings: { toleranceMeters?: number }
  }
  expect(json.tracks).toHaveLength(1)
  expect(json.tracks[0]?.filename).toBe('gr7.gpx')
  expect(json.settings.toleranceMeters).toBeGreaterThan(0)

  // L'appareil neuf : plus rien en base.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const requete = indexedDB.deleteDatabase('sentiers')
        requete.onsuccess = () => {
          resolve()
        }
        requete.onerror = () => {
          resolve()
        }
        requete.onblocked = () => {
          resolve()
        }
      }),
  )
  await page.reload()
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await expect(page.getByTestId('tracks-empty')).toBeVisible()

  await page.getByTestId('backup').locator('summary').click()
  await page.getByTestId('backup-input').setInputFiles({
    name: fichier.suggestedFilename(),
    mimeType: 'application/gzip',
    buffer: contenu,
  })

  // La sortie est revenue — et le pourcentage avec elle.
  await expect(page.getByTestId('backup-message')).toContainText(
    '1 trace ajoutée',
  )
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('tracks-list')).toContainText('gr7.gpx')

  // Elle survit au rechargement : elle est bien retournée en base, pas
  // seulement en mémoire.
  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText('gr7.gpx', {
    timeout: 15_000,
  })
})

test('restaurer deux fois la même sauvegarde ne duplique rien', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('gr7.gpx')

  await page.getByTestId('backup').locator('summary').click()
  const { contenu } = await telecharger(page)

  // Restaurer sur un appareil qui a déjà la sortie : rien n'entre, et on le
  // dit — un silence se lirait comme un échec.
  await page.getByTestId('backup-input').setInputFiles({
    name: 'sauvegarde.json.gz',
    mimeType: 'application/gzip',
    buffer: contenu,
  })
  await expect(page.getByTestId('backup-message')).toContainText(
    /déjà présent|rien de nouveau/,
  )
  await expect(page.getByTestId('tracks-list').locator('> li')).toHaveCount(1)
})

test('un fichier qui n’est pas une sauvegarde est refusé, en le disant', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('backup').locator('summary').click()
  await page.getByTestId('backup-input').setInputFiles({
    name: 'photo.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"type":"FeatureCollection","features":[]}', 'utf-8'),
  })

  await expect(page.getByTestId('gpx-errors')).toContainText(
    /n’est pas une sauvegarde Sentiers/,
  )
  // Et rien n'a été touché au passage.
  await expect(page.getByTestId('tracks-empty')).toBeVisible()
})
