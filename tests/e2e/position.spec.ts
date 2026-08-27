import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  mockExternalNetwork,
  hasMap,
  waitForMapReady,
  type MapLike,
} from './helpers.ts'

// Position simulée : sur le GR 7 de la fixture Pilat (lat 45,4).
test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 45.4, longitude: 4.505 },
})

test('afficher sa position sur la carte, puis arrêter le suivi', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  // La caméra n'obéit qu'une fois la carte chargée (cf. issue #111).
  await waitForMapReady(page)

  const toggle = page.getByTestId('locate-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()

  // Le suivi démarre et la précision rapportée par l'appareil s'affiche.
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('geo-accuracy')).toContainText('±', {
    timeout: 10_000,
  })
  await expect(page.getByTestId('geo-error')).toHaveCount(0)

  // La carte se recentre sur la position au premier relevé.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const map = (window as unknown as { __sentiersMap?: MapLike })
            .__sentiersMap
          return map ? Math.abs(map.getCenter().lng - 4.505) : 99
        }),
      { timeout: 15_000 },
    )
    .toBeLessThan(0.01)

  // Second clic : le suivi s'arrête et l'indicateur disparaît.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('geo-accuracy')).toHaveCount(0)
})

test('un refus de localisation affiche un message qui dit quoi faire', async ({
  page,
}) => {
  // Chromium headless ne déclenche pas d'erreur quand la permission est
  // retirée : il ne rappelle jamais. On simule donc directement le refus
  // renvoyé par l'API, pour tester notre propre gestion d'erreur.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (
          _onSuccess: unknown,
          onError: (error: { code: number; message: string }) => void,
        ) => {
          setTimeout(() => {
            onError({ code: 1, message: 'User denied Geolocation' })
          }, 0)
          return 1
        },
        clearWatch: () => undefined,
        getCurrentPosition: () => undefined,
      },
    })
  })
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('locate-toggle').click()
  const error = page.getByTestId('geo-error')
  await expect(error).toBeVisible({ timeout: 15_000 })
  await expect(error).toContainText(/autoris|position|signal|temps/i)
  // L'interface reste utilisable : le bouton retombe à l'état inactif.
  await expect(page.getByTestId('locate-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
