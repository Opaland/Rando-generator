import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #175 — la mécanique de l'historique à petite échelle : chercher,
 * trier, traverser les plis.
 *
 * **Ce fichier citait le critère de l'issue — « parmi huit cents » — et en
 * mesurait quarante.** Quarante tiennent dans une liste qu'on déroule ; huit
 * cents sont le cas que Karim a apporté avec son archive Garmin, et celui
 * pour lequel l'issue a été ouverte. Un test qui cite un nombre et en
 * éprouve un autre affirme plus qu'il ne mesure (CLAUDE.md §1bis).
 *
 * Le vrai critère est éprouvé dans `historique-800.spec.ts`, qui charge
 * l'année ouverte au-delà du plafond. Celui-ci garde ce qu'il sait garder :
 * la recherche, le tri, et le fait qu'on trouve dans une année repliée.
 */
function gpx(
  nom: string,
  date: string,
  points: number,
  rang: number,
): { name: string; mimeType: string; buffer: Buffer } {
  // Chaque trace suit sa propre latitude : deux archives identiques au
  // point près seraient écartées comme doublons (issue #165), et la liste
  // ne compterait pas ce que le test croit y avoir mis.
  const lat = (45.4 + rang * 0.002).toFixed(6)
  const trkpts = Array.from(
    { length: points },
    (_, i) => `<trkpt lat="${lat}" lon="${(4.5 + i * 0.0002).toFixed(6)}"><ele>800</ele></trkpt>`,
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

/** Quarante sorties sur trois années, dont une seule cherchée. */
function archive() {
  const fichiers = []
  let rang = 0
  for (let i = 0; i < 18; i += 1) {
    fichiers.push(gpx(`2026-sortie-${i}.gpx`, `2026-0${(i % 9) + 1}-1${i % 9}T08:00:00Z`, 12 + i, rang++))
  }
  for (let i = 0; i < 14; i += 1) {
    fichiers.push(gpx(`2025-sortie-${i}.gpx`, `2025-0${(i % 9) + 1}-1${i % 9}T08:00:00Z`, 12 + i, rang++))
  }
  fichiers.push(gpx('crete-du-pilat.gpx', '2018-09-04T08:00:00Z', 60, rang++))
  for (let i = 0; i < 7; i += 1) {
    fichiers.push(gpx(`2018-sortie-${i}.gpx`, `2018-0${(i % 9) + 1}-1${i % 9}T08:00:00Z`, 12 + i, rang++))
  }
  return fichiers
}

test('retrouver une sortie de 2018 parmi quarante, sans dérouler la liste', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('gpx-input').setInputFiles(archive())
  await expect(page.getByTestId('tracks-compte')).toContainText('40 sorties', {
    timeout: 30_000,
  })

  // 2018 est replié : la sortie cherchée n'est pas à l'écran.
  await expect(page.getByTestId('track-toggle-crete-du-pilat.gpx')).toHaveCount(0)
  // Et 2026, l'année la plus récente, est ouverte.
  await expect(page.getByTestId('track-toggle-2026-sortie-0.gpx')).toBeVisible()

  await page.getByTestId('tracks-recherche').fill('crete')

  // Trouvée, alors même que son année est repliée : chercher traverse les
  // plis, sinon la recherche mentirait par omission.
  await expect(page.getByTestId('track-toggle-crete-du-pilat.gpx')).toBeVisible()
  await expect(page.getByTestId('tracks-compte')).toContainText('1 sur 40')
  await expect(page.getByTestId('track-toggle-2026-sortie-0.gpx')).toHaveCount(0)
})

test('le tri change l’ordre, et le dit', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('gpx-input').setInputFiles(archive())
  await expect(page.getByTestId('tracks-compte')).toContainText('40 sorties', {
    timeout: 30_000,
  })

  // Trier par distance range la plus longue en tête, toutes années
  // confondues — donc « crete-du-pilat.gpx », la seule à quarante points.
  await page.getByTestId('tracks-tri').selectOption('distance')
  const premier = page.getByTestId('tracks-list').first().locator('li').first()
  await expect(premier).toContainText('crete-du-pilat.gpx')
})

test('une recherche sans résultat le dit, au lieu de tout montrer', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('gpx-input').setInputFiles(archive())
  await expect(page.getByTestId('tracks-compte')).toContainText('40 sorties', {
    timeout: 30_000,
  })

  await page.getByTestId('tracks-recherche').fill('zzzz')
  await expect(page.getByTestId('tracks-aucun-resultat')).toBeVisible()
  await expect(page.getByTestId('tracks-list')).toHaveCount(0)
})
