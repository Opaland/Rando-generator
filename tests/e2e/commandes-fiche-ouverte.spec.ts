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
 * Ce que ça ne réglait pas, mesuré le même jour : à 360 × 640 la bande de
 * carte au-dessus de la fiche fait 260 px (130 en gros texte), et le zoom
 * seul en prend 132. La boussole y restait sous « Ma position » ; le
 * 27/10, à 390 × 844 en gros texte aussi, sous les polices Linux de ce
 * conteneur (259-303 px) alors que la CI la peignait.
 *
 * Tranché par Cédric le 27/10 : fiche ouverte, la boussole s'efface comme
 * ▶, et revient avec la carte. Le « − » à 360 × 640 dépend encore de la
 * hauteur de l'en-tête — peint sous Windows, recouvert en CI (151-195 px
 * sous « Ma position ») — : on n'y affirme que ce que les décisions
 * garantissent, « + » peint, ▶ et la boussole effacés.
 */
/**
 * « ok », ou ce qui est peint à la place : un simple booléen disait
 * « faux » en CI sans dire quoi recouvrait la commande (22/10).
 */
async function peintsParEuxMemes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const peint = (sel: string) => {
      const e = document.querySelector(sel)
      if (!e) return 'absent'
      const r = e.getBoundingClientRect()
      if (r.width === 0) return 'sans taille'
      const p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      if (p !== null && e.contains(p)) return 'ok'
      const temoin =
        p?.closest('[data-testid]')?.getAttribute('data-testid') ??
        p?.className.toString() ??
        'rien'
      return `sous ${temoin} (${String(Math.round(r.top))}-${String(Math.round(r.bottom))} px)`
    }
    return {
      zoomIn: peint('.maplibregl-ctrl-zoom-in'),
      zoomOut: peint('.maplibregl-ctrl-zoom-out'),
      // Fiche ouverte au téléphone, effacée et non recouverte : `display:
      // none` rend une boîte vide, que `peint` dit « sans taille ».
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
    attendu: { zoomIn: 'ok', zoomOut: 'ok', boussole: 'sans taille', maPosition: 'ok' },
  },
  {
    nom: '360 × 640',
    largeur: 360,
    hauteur: 640,
    gros: false,
    attendu: { zoomIn: 'ok', boussole: 'sans taille', maPosition: 'ok' },
  },
]) {
  test.describe(`fiche ouverte au doigt — ${vue.nom}`, () => {
    test.use({
      viewport: { width: vue.largeur, height: vue.hauteur },
      hasTouch: true,
      isMobile: true,
    })

    test('le zoom reste entier, et ▶ comme la boussole reviennent à la fermeture de la fiche', async ({
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
      // La boussole aussi, peinte par elle-même (§1bis).
      await expect
        .poll(async () => (await peintsParEuxMemes(page)).boussole)
        .toBe('ok')
    })
  })
}
