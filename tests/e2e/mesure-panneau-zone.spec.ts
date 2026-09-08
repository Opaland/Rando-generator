import { test } from '@playwright/test'
import { fermerLeGuide, mockElevation, mockExternalNetwork, mockTilesOk } from './helpers.ts'

/**
 * Issue #504 — ce que le panneau de zone occupe à l'écran, mesuré.
 *
 * Cédric le décrit comme « lourd », et propose trois pistes pour le
 * remplacer (géolocalisation, recherche, arbre de décision) — un choix de
 * produit que ce fichier ne tranche pas (§2, §6sexies). Ce qu'il chiffre est
 * la seule partie que l'issue elle-même range « sans arbitrage » : la
 * hauteur du panneau ouvert au premier chargement, sa part de l'écran, et
 * combien de zones sont atteignables sans faire défiler.
 *
 * Trois largeurs de `regles-d-ecran.spec.ts` (390, 800, 1280) — la tablette
 * paysage (1024) n'ajoute rien ici, la question posée ne dépend pas du
 * geste tactile. Un seul état : l'accueil, panneau ouvert par défaut au
 * premier chargement (aucune zone en cache) — c'est l'état que l'issue vise,
 * « ce qui est le plus lourd est aussi ce qu'on découvre le plus tard ».
 *
 * Hors de la porte, comme `mesure-bibliotheque.spec.ts` : `npm run panneau`.
 */

const LARGEURS = [
  { nom: 'téléphone', width: 390, height: 844 },
  { nom: 'point de rupture', width: 800, height: 900 },
  { nom: 'PC', width: 1280, height: 800 },
] as const

function relever(nom: string, valeur: string): void {
  process.stdout.write(`\nMESURE ${nom} = ${valeur}\n`)
}

test.describe('ce que le panneau de zone occupe (issue #504)', () => {
  test.skip(
    process.env['PANNEAU'] !== '1',
    'Mesure de mise en page, hors de la porte : `npm run panneau`.',
  )

  for (const vue of LARGEURS) {
    test(`${vue.nom} (${String(vue.width)} px)`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vue.width, height: vue.height },
      })
      const page = await context.newPage()
      await mockExternalNetwork(page)
      await mockTilesOk(page)
      await mockElevation(page)
      await page.goto('/')
      await fermerLeGuide(page)

      const panneau = page.getByTestId('zone-section')
      const boite = await panneau.boundingBox()
      if (!boite) throw new Error('panneau de zone introuvable')

      /*
        `button[…]` et non `[data-testid^="zone-"]` seul : ce dernier
        attraperait aussi le conteneur `zone-section` lui-même, dont le
        testid partage le même préfixe — un défaut trouvé en lisant le
        premier résultat (26 au lieu des 25 comptées par l'issue), avant de
        rapporter quoi que ce soit (§1bis).
      */
      const zones = page.locator(
        'button[data-testid^="zone-"], button[data-testid^="featured-"]',
      )
      const nombreDeZones = await zones.count()
      let visiblesSansDefiler = 0
      for (let i = 0; i < nombreDeZones; i += 1) {
        const rect = await zones.nth(i).boundingBox()
        if (rect && rect.y >= 0 && rect.y + rect.height <= vue.height) {
          visiblesSansDefiler += 1
        }
      }

      relever(`${vue.nom}_panneau_hauteur_px`, String(Math.round(boite.height)))
      relever(
        `${vue.nom}_panneau_part_viewport`,
        `${((boite.height / vue.height) * 100).toFixed(0)} %`,
      )
      relever(`${vue.nom}_zones_totales`, String(nombreDeZones))
      relever(`${vue.nom}_zones_visibles_sans_defiler`, String(visiblesSansDefiler))

      await context.close()
    })
  }

  test.afterAll(() => {
    process.stdout.write(
      '\nÀ lire : « panneau_part_viewport » au-delà de 100 % dit que le\n' +
        'panneau dépasse déjà la hauteur d’écran avant même d’avoir chargé une\n' +
        'zone — donc que quelqu’un fait défiler avant de voir la carte.\n' +
        '« zones_visibles_sans_defiler » sur « zones_totales » dit combien des\n' +
        '25 boutons actuels sont réellement à portée de vue au premier regard.\n',
    )
  })
})
