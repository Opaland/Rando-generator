import { test, expect, type Page, type Request } from '@playwright/test'
import { buildGpx, fermerLeGuide, mockExternalNetwork } from './helpers.ts'

/**
 * Issue #673 — le bilan de saison écrit par Claude, avec la clé de chacun.
 *
 * La CI n'a pas de clé : l'API d'Anthropic est simulée ici, au format réel
 * d'une réponse de l'API Messages. Ce qui est éprouvé est le chemin entier :
 * la clé posée dans Réglages, la requête qui part (et ce qu'elle ne contient
 * **pas**), la vérification des nombres, et ce qui est montré ou retenu.
 *
 * Un essai avec une vraie clé, sur un vrai téléphone, reste à Cédric (§10).
 */
const CLE = 'sk-ant-essai-e2e'

function reponse(texte: string) {
  return {
    id: 'msg_e2e',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: texte }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 250 },
  }
}

/** Simule l'API ; rend les requêtes reçues, pour lire ce qui est parti. */
async function simulerClaude(page: Page, texte: (corps: string) => string): Promise<Request[]> {
  const recues: Request[] = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    recues.push(route.request())
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(reponse(texte(route.request().postData() ?? ''))),
    })
  })
  return recues
}

async function importerTroisSorties(page: Page): Promise<void> {
  await page.getByTestId('gpx-input').setInputFiles(
    ['2026-05-10T08:00:00Z', '2026-06-14T08:00:00Z', '2026-06-21T08:00:00Z'].map((date, i) => ({
      name: `chez-mamie-${String(i)}.gpx`,
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(buildGpx(15 + i * 40, date), 'utf-8'),
    })),
  )
  await expect(page.getByTestId('history-totals')).toContainText('3 sorties', { timeout: 30_000 })
}

async function poserLaCle(page: Page, garder: boolean): Promise<void> {
  const reglages = page.getByTestId('settings')
  if ((await reglages.getAttribute('open')) === null) {
    await reglages.locator('summary').first().click()
  }
  await page.getByTestId('claude-cle').fill(CLE)
  if (garder) await page.getByTestId('claude-garder').check()
  await page.getByTestId('claude-poser').click()
  await expect(page.getByTestId('claude-etat')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
})

test('sans clé, rien ne part et le bilan dit comment l’activer', async ({ page }) => {
  const recues = await simulerClaude(page, () => 'jamais')
  await importerTroisSorties(page)
  await expect(page.getByTestId('bilan-sans-cle')).toBeVisible()
  await expect(page.getByTestId('bilan-demander')).toHaveCount(0)
  expect(recues).toHaveLength(0)
})

test('avec une clé, le bilan s’affiche, et ni trace ni nom de fichier ne part', async ({
  page,
}) => {
  // Claude répond avec les nombres qu'il a reçus : un texte vérifiable.
  const recues = await simulerClaude(page, (corps) => {
    const faits = JSON.parse(
      (JSON.parse(corps) as { messages: { content: string }[] }).messages[0].content.replace(
        /^[^{]*/,
        '',
      ),
    ) as { annee: number; sorties: number; km: number }
    return `En ${String(faits.annee)}, vous êtes sorti ${String(faits.sorties)} fois pour ${String(faits.km).replace('.', ',')} km.`
  })
  await importerTroisSorties(page)
  await poserLaCle(page, false)

  // Ce qui partira est montré avant l'envoi.
  await page.getByTestId('bilan-envoye').click()
  await expect(page.getByTestId('bilan-faits')).toContainText('"sorties": 3')

  await page.getByTestId('bilan-demander').click()
  await expect(page.getByTestId('bilan-texte')).toContainText('En 2026, vous êtes sorti 3 fois')
  await expect(page.getByTestId('bilan-texte')).toContainText('claude-opus-5-5')

  expect(recues).toHaveLength(1)
  const requete = recues[0]
  // Le SDK 1.8 (API 2026-10-21) porte la clé en « Authorization: Bearer ».
  expect(await requete.headerValue('authorization')).toBe(`Bearer ${CLE}`)
  const corps = requete.postData() ?? ''
  expect(corps).toContain('claude-opus-5-5')
  expect(corps).not.toMatch(/chez-mamie|\.gpx/)
  expect(corps).not.toMatch(/45\.4\d|4\.5\d{2}/)
  expect(corps).not.toMatch(/2026-0\d-\d\d/)

  // Non gardée : la clé n'est pas écrite sur l'appareil.
  expect(await page.evaluate(() => localStorage.getItem('sentiers.claude.cle'))).toBeNull()
})

test('un texte qui invente un nombre n’est pas affiché', async ({ page }) => {
  await simulerClaude(page, () => 'Une année record : 999 km et 42 sorties.')
  await importerTroisSorties(page)
  await poserLaCle(page, false)
  await page.getByTestId('bilan-demander').click()
  await expect(page.getByTestId('bilan-retenu')).toContainText('999')
  await expect(page.getByTestId('bilan-texte')).toHaveCount(0)
  await expect(page.getByText('Une année record')).toHaveCount(0)
})

test('gardée sur demande seulement, et oubliée d’un geste', async ({ page }) => {
  await simulerClaude(page, () => '')
  await poserLaCle(page, true)
  expect(await page.evaluate(() => localStorage.getItem('sentiers.claude.cle'))).toBe(CLE)
  await page.getByTestId('claude-oublier').click()
  await expect(page.getByTestId('claude-cle')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sentiers.claude.cle'))).toBeNull()
})
