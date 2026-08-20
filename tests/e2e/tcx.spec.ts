import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Import d'un TCX (Garmin Training Center). La trace synthétique longe le
 * GR 7 de la fixture Pilat, décalée de 15 m au nord, comme le GPX et le FIT
 * du scénario nominal : les trois formats doivent donner le même résultat.
 */
function tcxLeLongDuGr7(): string {
  const lat = 45.4 + 15 / 111_195
  const points: string[] = []
  for (let i = 0; i <= 150; i += 1) {
    const heure = new Date(Date.UTC(2024, 5, 15, 8, 0, i * 10)).toISOString()
    points.push(
      `<Trackpoint><Time>${heure}</Time>` +
        `<Position><LatitudeDegrees>${lat}</LatitudeDegrees>` +
        `<LongitudeDegrees>${(4.5 + i * 0.0002).toFixed(6)}</LongitudeDegrees></Position>` +
        `<AltitudeMeters>${800 + (i % 30)}</AltitudeMeters></Trackpoint>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Hiking">
    <Id>2024-06-15T08:00:00Z</Id>
    <Lap><Track>${points.join('')}</Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`
}

test('une vieille archive au format TCX s’importe comme un GPX', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'activite.tcx',
    mimeType: 'application/vnd.garmin.tcx+xml',
    buffer: Buffer.from(tcxLeLongDuGr7(), 'utf-8'),
  })

  await expect(page.getByTestId('tracks-list')).toContainText('activite.tcx')
  // Même couverture que le GPX et le FIT équivalents.
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  // La date déclarée par l'activité est reprise telle quelle.
  await expect(page.getByTestId('tracks-list')).toContainText('15/06/2024')
})

test('un TCX illisible est refusé avec un message qui nomme le format', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'casse.tcx',
    mimeType: 'application/vnd.garmin.tcx+xml',
    buffer: Buffer.from('<TrainingCenterDatabase><oups>', 'utf-8'),
  })

  await expect(page.getByTestId('gpx-errors')).toContainText('TCX')
})
