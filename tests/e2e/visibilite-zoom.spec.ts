import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from './helpers.ts'

/**
 * La visibilité des tracés selon le zoom (issue #523, demande de Cédric).
 *
 * #523 établissait l'absence totale de logique de zoom sur les couches de
 * tracés — aucun `minzoom`, aucune expression `step`/`interpolate` sur
 * `line-width`. À l'échelle d'une région entière, tous les tracés se
 * peignaient donc à la même épaisseur qu'au zoom le plus rapproché.
 *
 * Choix de présentation (§2, assumé dans le code plutôt que mesuré) :
 * - le liseré (`trails-casing`) s'amincit sous le zoom 11 et retrouve son
 *   épaisseur actuelle à partir de là ;
 * - la bande de revêtement (détail décalé de 3 px, illisible de loin) ne se
 *   peint qu'à partir du zoom 12 — un palier au-dessus, par construction :
 *   le détail n'apparaît qu'une fois le liseré déjà à taille normale.
 *
 * **`trails-base` et `trails-done` gardent leur largeur fixe.** Première
 * version : amincies elles aussi. Rouge sur onze tests e2e qui cliquent un
 * tracé à faible zoom (`openDetailFromMap`) — MapLibre calcule la zone
 * cliquable d'une ligne à partir de sa largeur **rendue**, et une ligne plus
 * fine est plus facile à manquer. Seul le liseré, qui ne reçoit aucun
 * gestionnaire de clic, peut s'amincir sans conséquence.
 *
 * Pistes écartées : un dégradé continu (`interpolate`) aurait multiplié les
 * points de contrôle à justifier sans gain visible pour une seule revue ;
 * baisser aussi `line-opacity` aurait ajouté un second nombre inventé pour
 * le même objectif (moins de poids visuel), déjà atteint par la largeur
 * seule. Le palier à 11 est posé par rapport à l'ancrage déjà présent dans
 * `useMapCamera.ts` (zoom 15 pour « regarder un itinéraire sélectionné ») :
 * sous ce point, quelque chose de plus large qu'une seule sortie est à
 * l'écran, et c'est précisément le cas que #523 décrit.
 */
test.use({ viewport: { width: 1280, height: 800 } })

interface StyleLike {
  getStyle: () => {
    layers: { id: string; minzoom?: number; paint?: Record<string, unknown> }[]
  }
}

async function chargerLaZone(page: import('@playwright/test').Page) {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
}

function styleDuneCouche(
  page: import('@playwright/test').Page,
  id: string,
): Promise<{ minzoom?: number; paint?: Record<string, unknown> } | null> {
  return page.evaluate(
    (idCherche) => {
      const carte = (window as unknown as { __sentiersMap?: StyleLike })
        .__sentiersMap
      const couche = carte?.getStyle().layers.find((c) => c.id === idCherche)
      return couche ? { minzoom: couche.minzoom, paint: couche.paint } : null
    },
    id,
  )
}

test('le liseré a une largeur qui dépend du zoom', async ({ page }) => {
  await chargerLaZone(page)

  const couche = await styleDuneCouche(page, 'trails-casing')
  expect(couche, 'couche trails-casing introuvable').not.toBeNull()
  const largeur = couche?.paint?.['line-width']
  // Un nombre fixe ne dépend pas du zoom ; une expression (tableau,
  // `['step', ['zoom'], …]`) le fait. C'est exactement la vérification
  // inverse de celle que #523 a posée pour constater l'absence du geste.
  expect(
    Array.isArray(largeur),
    `trails-casing : line-width devrait être une expression dépendante du zoom, pas ${JSON.stringify(largeur)}`,
  ).toBe(true)
})

test('les couches cliquables gardent une largeur fixe', async ({ page }) => {
  // Garde contre la régression mesurée en écrivant #523 : amincir les
  // couches cliquables casse le clic sur un tracé à faible zoom, parce que
  // MapLibre calcule la zone cliquable d'une ligne à partir de sa largeur
  // rendue. Onze tests e2e passant par `openDetailFromMap` ont rougi avant
  // que ce test n'existe — celui-ci les protège sans avoir à relancer la
  // suite entière pour s'en apercevoir.
  await chargerLaZone(page)

  for (const id of ['trails-base', 'trails-done']) {
    const couche = await styleDuneCouche(page, id)
    expect(couche, `couche ${id} introuvable`).not.toBeNull()
    const largeur = couche?.paint?.['line-width']
    expect(
      typeof largeur,
      `${id} : line-width devrait rester un nombre fixe, pas ${JSON.stringify(largeur)}`,
    ).toBe('number')
  }
})

test('la bande de revêtement ne se peint qu’à partir d’un certain zoom', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .first()
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible({
    timeout: 15_000,
  })

  const rendues = (zoom: number) =>
    page.evaluate((z) => {
      const carte = (
        window as unknown as {
          __sentiersMap?: {
            setZoom: (z: number) => void
            queryRenderedFeatures: (
              point: undefined,
              options: { layers: string[] },
            ) => unknown[]
          }
        }
      ).__sentiersMap
      carte?.setZoom(z)
      return carte?.queryRenderedFeatures(undefined, {
        layers: ['trails-revetement'],
      }).length
    }, zoom)

  // La source, elle, est déjà peuplée (vérifié par ailleurs dans
  // terrain-sur-carte.spec.ts) : c'est bien le rendu par zoom qu'on vise.
  await expect.poll(() => rendues(8), { timeout: 15_000 }).toBe(0)
  await expect.poll(() => rendues(14)).toBeGreaterThan(0)
})
