import { test, expect, type Page } from '@playwright/test'
import {
  activerLeGrosTexte,
  afficherTousLesReseaux,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  ouvrirLaFicheDuGr7,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Issue #584 — au téléphone, fiche ouverte, la carte n'a plus qu'une bande :
 * le zoom part du haut, ▶ « Démarrer une sortie » part du haut de la fiche,
 * et les deux piles se rencontraient. Mesuré le 22/10 : à 390 × 844 en gros
 * texte, le centre du « − » était peint par ▶ ; à 360 × 640, idem, et la
 * boussole par « Ma position ».
 *
 * Tranché par Cédric le 22/10 : fiche ouverte, ▶ s'efface. On y lit un
 * itinéraire ; le départ rapide revient dès qu'on referme la fiche.
 *
 * Ce que ça ne règle pas, mesuré le même jour : à 360 × 640 la bande de
 * carte au-dessus de la fiche fait 260 px (130 en gros texte), et le zoom
 * seul en prend 132. La boussole y reste sous « Ma position » : c'est la
 * suite de #584, à trancher, d'où son absence de l'assertion à cette taille.
 */
async function peintsParEuxMemes(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => {
    const peint = (sel: string) => {
      const e = document.querySelector(sel)
      if (!e) return false
      const r = e.getBoundingClientRect()
      if (r.width === 0) return false
      const p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return p !== null && e.contains(p)
    }
    return {
      zoomIn: peint('.maplibregl-ctrl-zoom-in'),
      zoomOut: peint('.maplibregl-ctrl-zoom-out'),
      boussole: peint('.maplibregl-ctrl-compass'),
      maPosition: peint('[data-testid="locate-toggle"]'),
    }
  })
}

for (const vue of [
  {
    nom: '390 × 844, gros texte',
    largeur: 390,
    hauteur: 844,
    gros: true,
    attendu: { zoomIn: true, zoomOut: true, boussole: true, maPosition: true },
  },
  {
    nom: '360 × 640',
    largeur: 360,
    hauteur: 640,
    gros: false,
    attendu: { zoomIn: true, zoomOut: true, maPosition: true },
  },
]) {
  test.describe(`fiche ouverte au doigt — ${vue.nom}`, () => {
    test.use({
      viewport: { width: vue.largeur, height: vue.hauteur },
      hasTouch: true,
      isMobile: true,
    })

    test('le zoom reste entier, et ▶ revient à la fermeture de la fiche', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await mockElevation(page)
      await page.goto('/')
      await fermerLeGuide(page)
      if (vue.gros) await activerLeGrosTexte(page, true)
      await ouvrirOnglet(page, 'carte')
      await page.getByTestId('zone-pilat').click()
      await page.getByTestId('zone-meta').waitFor({ state: 'attached' })
      await afficherTousLesReseaux(page)
      await ouvrirLaFicheDuGr7(page, true)

      await expect
        .poll(() => peintsParEuxMemes(page), { timeout: 10_000 })
        .toMatchObject(vue.attendu)
      await expect(page.getByTestId('demarrer-rapide')).toHaveCount(0)

      // Le départ rapide n'a pas disparu : il revient avec la carte.
      await page.getByTestId('itinerary-detail-close').click()
      await ouvrirOnglet(page, 'carte')
      await expect(page.getByTestId('demarrer-rapide')).toBeVisible()
    })
  })
}
