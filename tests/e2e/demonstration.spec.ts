import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx } from './helpers.ts'
import type { Page } from '@playwright/test'

/**
 * Issue #172 — montrer le résultat avant de demander l'effort.
 *
 * La démonstration ne vaut que si elle ne ment pas : chiffres calculés pour
 * de vrai, données réelles pour les itinéraires, et surtout aucune trace
 * laissée dans la base de l'utilisateur.
 */

/** Boucles locales servies à la place du jeu réel (568 ko en production). */
async function mockBoucles(page: Page): Promise<void> {
  const features = [1, 2, 3, 4, 5].map((gid) => ({
    type: 'Feature',
    properties: { gid, nom: `Boucle ${String(gid)}`, commune_depart: 'Lyon' },
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        Array.from({ length: 30 }, (_, i) => [
          4.8 + i * 0.001,
          45.7 + gid * 0.02,
        ]),
      ],
    },
  }))
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features } }),
  )
}

test('« Voir un exemple » remplit le tableau de bord sans rien demander', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockBoucles(page)
  await page.goto('/')

  await page.getByTestId('voir-un-exemple').click()

  // Un vrai pourcentage, ni 0 % ni 100 % : une progression en cours.
  // Le chiffre est animé depuis zéro (useCountUp) : on attend sa valeur
  // d'arrivée au lieu de la lire au vol, sans quoi on mesure l'animation.
  const pct = page.getByTestId('global-pct')
  await expect(pct).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(async () => (await pct.textContent()) ?? '', { timeout: 10_000 })
    .not.toBe('0 %')
  expect(await pct.textContent()).not.toBe('100 %')
  // Et le zéro explicatif a cédé la place aux vrais chiffres.
  await expect(page.getByTestId('global-vide')).toHaveCount(0)

  // Et elle s'annonce comme une démonstration.
  await expect(page.getByTestId('demo-banner')).toContainText('fictives')
  await expect(page.getByTestId('tracks-list')).toContainText('Démonstration')
})

test('la démonstration ne laisse rien après un rechargement', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockBoucles(page)
  await page.goto('/')
  await page.getByTestId('voir-un-exemple').click()
  await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 10_000 })

  // Le contrôle qui compte : rien n'a été écrit en base.
  await page.reload()
  await expect(page.getByTestId('onboarding')).toBeVisible()
  await expect(page.getByTestId('demo-banner')).toHaveCount(0)
})

test('quitter la démonstration rend l’application à son état réel', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockBoucles(page)
  await page.goto('/')
  await page.getByTestId('voir-un-exemple').click()
  await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('demo-quitter').click()
  await expect(page.getByTestId('demo-banner')).toHaveCount(0)
  await expect(page.getByTestId('onboarding')).toBeVisible()
})

test('un vrai import chasse la démonstration sans se mêler à elle', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockBoucles(page)
  await page.goto('/')
  await page.getByTestId('voir-un-exemple').click()
  await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'ma-sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })

  await expect(page.getByTestId('demo-banner')).toHaveCount(0)
  const liste = page.getByTestId('tracks-list')
  await expect(liste).toContainText('ma-sortie.gpx')
  await expect(liste).not.toContainText('Démonstration')

  // Et c'est bien la vraie sortie qui a été enregistrée, elle seule.
  await page.reload()
  await expect(page.getByTestId('tracks-list')).toContainText('ma-sortie.gpx')
  await expect(page.getByTestId('tracks-list')).not.toContainText(
    'Démonstration',
  )
})

test('un zéro explique d’où il vient', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  // Zone chargée, aucune sortie : le chiffre nu se lisait comme une panne.
  await expect(page.getByTestId('global-pct')).toHaveText('0 %')
  await expect(page.getByTestId('global-vide')).toContainText(
    'Aucune sortie importée',
  )
  await expect(page.getByTestId('global-vide')).toContainText('à découvrir')
  await expect(page.getByTestId('global-km')).toHaveCount(0)
})

test('la proposition d’installation n’apparaît que si le navigateur la propose', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Chromium en test n'émet pas l'événement : rien ne doit s'afficher, et
  // surtout pas un mode d'emploi inventé.
  await expect(page.getByTestId('installer')).toHaveCount(0)

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt') as Event & {
      prompt?: () => Promise<void>
    }
    event.prompt = () => Promise.resolve()
    window.dispatchEvent(event)
  })
  await expect(page.getByTestId('installer')).toBeVisible()

  // Un seul clic utile : l'invite ne sert qu'une fois.
  await page.getByTestId('installer').click()
  await expect(page.getByTestId('installer')).toHaveCount(0)
})

test('un événement d’installation sans méthode n’affiche pas de bouton', async ({
  page,
}) => {
  // L'événement n'est pas standardisé : un bouton qui échouerait au clic
  // serait pire que pas de bouton (revue du sprint 2).
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeinstallprompt'))
  })
  await expect(page.getByTestId('installer')).toHaveCount(0)
})

/**
 * Issue #506 — trois issues distinctes, trois messages distincts.
 *
 * Retour terrain de Cédric, 04/09 : « j'ai eu une pop-up pour l'installer
 * mais je n'ai rien installé sur mon téléphone ». Les trois cas ci-dessous
 * — accepté, refusé, échoué après acceptation — étaient rigoureusement
 * indiscernables avant #506 : le bouton disparaissait dans les trois cas,
 * sans jamais lire `userChoice`.
 */
async function emettreInvite(
  page: Page,
  outcome: 'accepted' | 'dismissed',
  promptEchoue = false,
): Promise<void> {
  await page.evaluate(
    ({ outcome, promptEchoue }) => {
      const event = new Event('beforeinstallprompt') as Event & {
        prompt?: () => Promise<void>
        userChoice?: Promise<{ outcome: string }>
      }
      event.prompt = promptEchoue
        ? () => Promise.reject(new Error('boom'))
        : () => Promise.resolve()
      event.userChoice = Promise.resolve({ outcome })
      window.dispatchEvent(event)
    },
    { outcome, promptEchoue },
  )
}

test('un choix accepté confirme l’installation', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await emettreInvite(page, 'accepted')
  await page.getByTestId('installer').click()

  await expect(page.getByTestId('installer')).toHaveCount(0)
  await expect(page.getByTestId('installation-confirmee')).toContainText(
    'installée',
  )
})

test('un choix refusé le dit, sans se lire comme une panne', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await emettreInvite(page, 'dismissed')
  await page.getByTestId('installer').click()

  const refus = page.getByTestId('installation-refusee')
  await expect(refus).toContainText('annulée')
  // `role="status"`, pas `role="alert"` : un refus est un choix, pas une
  // panne — la distinction visuelle existe pour la même raison.
  await expect(refus).toHaveAttribute('role', 'status')
})

test('un prompt() qui échoue après acceptation le dit comme un échec', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await emettreInvite(page, 'accepted', true)
  await page.getByTestId('installer').click()

  const echec = page.getByTestId('installation-echec')
  await expect(echec).toContainText('échoué')
  await expect(echec).toHaveAttribute('role', 'alert')
})

test('sans userChoice, le bouton disparaît sans message inventé', async ({
  page,
}) => {
  // Repli du navigateur qui ne porte pas `userChoice` : on ne peut rien
  // affirmer sur l'issue, et un message inventé serait pire qu'aucun
  // message (même principe que l'événement sans `prompt`, ci-dessus).
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt') as Event & {
      prompt?: () => Promise<void>
    }
    event.prompt = () => Promise.resolve()
    window.dispatchEvent(event)
  })
  await page.getByTestId('installer').click()

  await expect(page.getByTestId('installer')).toHaveCount(0)
  await expect(page.getByTestId('installation-confirmee')).toHaveCount(0)
  await expect(page.getByTestId('installation-refusee')).toHaveCount(0)
  await expect(page.getByTestId('installation-echec')).toHaveCount(0)
})
