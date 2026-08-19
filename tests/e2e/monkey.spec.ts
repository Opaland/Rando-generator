import { test, expect, type Page } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'
import { GPX_MALFORMED, GPX_NO_TRKPT } from '../fixtures/gpx.ts'

/**
 * Monkey testing incarné — persona « Bernard », 64 ans, randonneur retraité :
 * enthousiaste, impatient, brouillon. Il clique partout (parfois deux fois),
 * importe n'importe quoi, secoue les réglages, tape des choses absurdes,
 * recharge la page quand « ça rame ». Aucune de ces maladresses ne doit
 * provoquer d'erreur JavaScript ni casser l'interface.
 *
 * Exploratoire, hors CI : lancer avec `MONKEY=1 npm run e2e -- monkey`.
 * Chaque séance est reproductible par sa graine (affichée dans le titre).
 */

const SEEDS = process.env.MONKEY_SEEDS
  ? process.env.MONKEY_SEEDS.split(',').map(Number)
  : [7, 42, 1986]
const ACTIONS_PER_SESSION = Number(process.env.MONKEY_ACTIONS ?? 120)

// PRNG mulberry32 : reproductible par graine.
function makeRng(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

const JUNK_TEXTS = [
  'GR 20',
  'gr7',
  '',
  '   ',
  '<script>alert(1)</script>',
  '🥾🥾🥾',
  'DROP TABLE itineraries;',
  'x'.repeat(500),
  'GR 65 (Nord)',
]

const JUNK_FILES = [
  { name: 'bernard.gpx', body: () => buildGpx(30) },
  { name: 'photo-vacances.gpx', body: () => 'JFIF\x00\x01 pas du xml' },
  { name: 'cassé.gpx', body: () => GPX_MALFORMED },
  { name: 'vide.gpx', body: () => '' },
  { name: 'sans-points.gpx', body: () => GPX_NO_TRKPT },
  { name: 'liste-courses.gpx', body: () => 'pain\nfromage\nsaucisson' },
]

interface CollectedErrors {
  pageErrors: string[]
  consoleErrors: string[]
}

function collectErrors(page: Page): CollectedErrors {
  const collected: CollectedErrors = { pageErrors: [], consoleErrors: [] }
  page.on('pageerror', (error) => {
    collected.pageErrors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // Le réseau externe est coupé exprès : les échecs de tuiles/fetch sont
    // attendus, seuls les autres messages d'erreur nous intéressent.
    if (
      /AJAXError|Failed to fetch|net::|Failed to load resource|ERR_|abort/i.test(
        text,
      )
    ) {
      return
    }
    collected.consoleErrors.push(text)
  })
  return collected
}

async function monkeyAction(page: Page, rng: () => number): Promise<void> {
  const roll = rng()

  if (roll < 0.28) {
    // Cliquer sur un bouton visible au hasard (parfois double clic).
    const buttons = page.locator('button:visible')
    const count = await buttons.count()
    if (count === 0) return
    const target = buttons.nth(Math.floor(rng() * count))
    if (rng() < 0.2) await target.dblclick({ timeout: 1500, force: true })
    else await target.click({ timeout: 1500, force: true })
  } else if (roll < 0.38) {
    // Importer un fichier plus ou moins valable, côté traces ou itinéraires.
    const input = rng() < 0.5 ? 'gpx-input' : 'custom-input'
    const file = pick(rng, JUNK_FILES)
    await page.getByTestId(input).setInputFiles(
      {
        name: file.name,
        mimeType: 'application/gpx+xml',
        buffer: Buffer.from(file.body(), 'utf-8'),
      },
      { timeout: 1500 },
    )
  } else if (roll < 0.5) {
    // Secouer le curseur de tolérance, y compris hors bornes.
    const value = pick(rng, ['25', '100', '5', '500', '63', '-10'])
    await page.getByTestId('tolerance-slider').fill(value, { timeout: 1500 })
  } else if (roll < 0.62) {
    // Taper des choses absurdes dans la recherche par ref, puis Entrée.
    const input = page.getByTestId('ref-input')
    await input.fill(pick(rng, JUNK_TEXTS), { timeout: 1500 })
    if (rng() < 0.6) await input.press('Enter', { timeout: 1500 })
  } else if (roll < 0.74) {
    // Pianoter au clavier.
    const key = pick(rng, ['Escape', 'Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown'])
    await page.keyboard.press(key)
  } else if (roll < 0.88) {
    // Gesticuler sur la carte : glisser, double-cliquer, molette.
    const map = page.getByTestId('map')
    const box = await map.boundingBox()
    if (!box) return
    const x = box.x + rng() * box.width
    const y = box.y + rng() * box.height
    const gesture = rng()
    if (gesture < 0.4) {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + (rng() - 0.5) * 200, y + (rng() - 0.5) * 200, {
        steps: 3,
      })
      await page.mouse.up()
    } else if (gesture < 0.7) {
      await page.mouse.dblclick(x, y)
    } else {
      await page.mouse.move(x, y)
      await page.mouse.wheel(0, (rng() - 0.5) * 800)
    }
  } else if (roll < 0.95) {
    // Ouvrir/fermer la page À propos.
    if (await page.getByTestId('about-dialog').isVisible({ timeout: 500 })) {
      await page.keyboard.press('Escape')
    } else {
      await page.getByTestId('about-open').click({ timeout: 1500 })
    }
  } else {
    // « Ça rame, je recharge. »
    await page.reload({ timeout: 15_000 })
  }
}

test.describe('Monkey testing — persona « Bernard »', () => {
  test.skip(
    !process.env.MONKEY,
    'Exploratoire : lancer avec MONKEY=1 (hors CI, actions aléatoires)',
  )

  for (const seed of SEEDS) {
    test(`séance de Bernard — graine ${seed}`, async ({ page }) => {
      test.setTimeout(180_000)
      const rng = makeRng(seed)
      const errors = collectErrors(page)
      await mockExternalNetwork(page)
      await page.goto('/')

      for (let i = 0; i < ACTIONS_PER_SESSION; i++) {
        try {
          await monkeyAction(page, rng)
        } catch {
          // Élément disparu, clic bloqué par un dialog… : Bernard s'en moque,
          // il continue. Seules les vraies erreurs JS comptent (collectées).
        }
      }

      // L'application doit avoir survécu à Bernard.
      await expect(
        page.getByRole('heading', { name: 'Sentiers', exact: true }),
      ).toBeVisible()
      expect(errors.pageErrors, 'erreurs JavaScript non capturées').toEqual([])
      expect(errors.consoleErrors, 'erreurs console applicatives').toEqual([])
    })
  }
})
