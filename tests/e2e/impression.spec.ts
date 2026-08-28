import { test, expect } from '@playwright/test'
import {
  afficherTousLesReseaux,
  mockExternalNetwork,
  estAlEcran,
} from './helpers.ts'

/**
 * Ce que Paul emporte dans sa poche (issue #362).
 *
 * Persona neuf de la revue globale du 28/08 : **Paul, 62 ans**, prépare ses
 * sorties sur ordinateur et imprime la fiche. Pas de téléphone en montagne —
 * batterie, pluie, et il n'aime pas ça.
 *
 * ## Pourquoi c'est mesurable
 *
 * `page.emulateMedia({ media: 'print' })` applique les règles `@media print`
 * à la page vivante : on peut donc demander au navigateur ce qu'il **peint**
 * pour l'imprimante, au lieu de relire la feuille de style et d'espérer.
 *
 * C'est la différence entre « la règle existe » et « la règle fait quelque
 * chose », et le §1 ne se contente pas de la première.
 *
 * ## Ce que ces tests ne disent pas
 *
 * Ni la pagination réelle, ni le rendu d'une imprimante. `break-inside` est
 * posé, jamais vérifié ici : Chromium ne rend pas de pages en émulation. Ce
 * qui est vérifié est ce qui **disparaît**, ce qui **reste**, et que le
 * papier ne déborde pas.
 */

async function ouvrirUneFiche(page: import('@playwright/test').Page) {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
}

test('à l’impression, l’ossature disparaît et la fiche reste', async ({
  page,
}) => {
  await ouvrirUneFiche(page)
  await page.emulateMedia({ media: 'print' })

  /*
    `toBeHidden` et non `estAlEcran` : ici on asserte une **absence**, et
    `display: none` la produit franchement. Le piège du §1bis est l'inverse —
    croire visible ce qui est écrêté — et il ne s'applique pas à ce sens-là.
  */
  await expect(page.locator('body > header')).toBeHidden()
  /*
    La **carte**, et non `<main>` : la fiche est un `<aside>` rendu dedans.
    Cette assertion disait `main` au premier jet, et elle encodait une
    supposition fausse sur l'arborescence — la même que la feuille de style.
    Les deux sont tombées à la même mesure.
  */
  await expect(page.getByTestId('map')).toBeHidden()
  await expect(page.getByTestId('sidebar')).toBeHidden()

  /*
    Et la fiche, elle, est bien peinte — mesuré au point, pas au rectangle.

    Le titre plutôt que la fiche entière : `estAlEcran` vise le **centre** de
    l'élément, et une fiche dépliée pour le papier est plus haute que la
    fenêtre. Son centre tombe alors hors écran et la mesure rend `false` — non
    parce que rien n'est peint, mais parce qu'on a visé un point qui n'existe
    pas. Un titre tient dans la fenêtre et appartient à la fiche.
  */
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
  expect(
    await estAlEcran(page, 'itinerary-detail-pct'),
    'le contenu de la fiche n’est pas peint sur la feuille',
  ).toBe(true)
})

test('la feuille dit le réseau et le balisage en toutes lettres', async ({
  page,
}) => {
  await ouvrirUneFiche(page)
  await page.emulateMedia({ media: 'print' })

  /*
    Une imprimante noir et blanc est le daltonisme de #360 poussé à son
    terme : si le réseau n'était dit que par la couleur du badge, la feuille
    ne le dirait pas du tout.

    Il l'est déjà — `NETWORK_BADGES` rend du texte. Ce test garde cet
    acquis plutôt qu'il ne le crée : si quelqu'un remplaçait le badge par une
    pastille colorée, la feuille deviendrait muette et personne ne le verrait.
  */
  await expect(page.getByTestId('itinerary-detail')).toContainText(/GR/)
})

test('rien ne déborde de la largeur du papier', async ({ page }) => {
  await ouvrirUneFiche(page)
  await page.emulateMedia({ media: 'print' })

  /*
    Une largeur A4 à 96 ppp, marges comprises : 21 cm ≈ 794 px, moins deux
    marges de 1 cm ≈ 718 px. On mesure plus large que ça — 794 — parce que le
    but n'est pas de simuler une imprimante mais d'attraper un panneau resté
    en colonne fixe, qui déborderait de plusieurs centaines de pixels.

    Bornée par `expect.poll` : la mise en page se pose en un temps non nul
    après le changement de média, et une mesure unique lirait l'état d'avant
    (§6ter).
  */
  await page.setViewportSize({ width: 794, height: 1123 })
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      { timeout: 5_000 },
    )
    .toBeLessThanOrEqual(0)
})
