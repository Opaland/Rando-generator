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
    `display: none` la produit franchement. Le piège du §1bis n'est pas
    celui-là — croire visible ce qui est écrêté — mais il y en avait un
    autre, et il a tenu une journée entière.

    ## Ce que cette ligne disait, et pourquoi elle ne prouvait rien

    Elle visait `body > header`. Ce sélecteur ne désigne **aucun** élément :
    React monte dans `#root`, l'en-tête n'est donc pas un enfant direct de
    `body`. Et `toBeHidden()` est satisfait par l'absence — le test passait,
    passerait toujours, et prouvait le contraire de ce qu'on lui demandait.

    Mesuré pendant ce temps, en média print : l'en-tête sortait à 1280×56 en
    `display: flex`, avec le bandeau de confidentialité, sur la fiche de
    route (#385).

    **Une assertion d'absence doit d'abord prouver que sa cible existe**,
    sinon elle mesure sa propre requête. D'où le compte ci-dessous, avant le
    masquage.
  */
  await expect(
    page.getByTestId('en-tete'),
    'l’en-tête n’existe pas : l’assertion de masquage qui suit mesurerait sa' +
      ' propre requête et passerait pour rien (#385)',
  ).toHaveCount(1)
  await expect(page.getByTestId('en-tete')).toBeHidden()
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

test('le bouton qui imprime existe, se touche, et sort de la feuille', async ({
  page,
}) => {
  await ouvrirUneFiche(page)

  /*
    Issue #369. La feuille d'impression était livrée depuis le 28/08 et rien
    ne disait qu'elle existait : ni bouton, ni README, ni PRD. Une fonction
    qu'on ne découvre qu'en devinant Ctrl+P n'est pas une fonction livrée —
    et Jeanine, 76 ans, qui n'a jamais eu de smartphone, ne connaît pas ce
    raccourci.

    Trois questions, et la troisième est celle qui compte : un bouton
    d'impression qui figure sur la feuille qu'il imprime est un défaut que
    seul le média « print » peut montrer.
  */
  const bouton = page.getByTestId('itinerary-detail-imprimer')
  await expect(bouton).toBeVisible()

  // Ce qui est **peint** à cet endroit, pas seulement ce qui a un rectangle
  // non vide : `toBeVisible` accepte un élément écrêté (§1bis).
  expect(await estAlEcran(page, 'itinerary-detail-imprimer')).toBe(true)

  const cible = await bouton.boundingBox()
  expect(cible).not.toBeNull()
  // WCAG 2.5.5 — le plancher que le reste de la fiche respecte déjà.
  expect(cible?.height ?? 0).toBeGreaterThanOrEqual(44)

  await page.emulateMedia({ media: 'print' })
  await expect
    .poll(async () => bouton.isVisible(), { timeout: 5_000 })
    .toBe(false)
})

/**
 * Ce que la feuille doit aux sources dont elle est tirée (issue #386).
 *
 * ## La sonde qui m'a trompé
 *
 * Mon premier relevé cherchait « OpenStreetMap » et « IGN » dans ce qui est
 * peint en média `print`. Les deux étaient là : le test aurait été vert, et
 * la feuille n'en portait pas moins **aucune attribution**. Ce que les mots
 * habitaient :
 *
 * - « Calculé sur la longueur, d'après ce qu'OpenStreetMap renseigne… » —
 *   une note de qualité ;
 * - « Tracé modifié dans OpenStreetMap le 02/04/2019 » — une note de
 *   fraîcheur ;
 * - « Ouvrir cette relation dans OpenStreetMap » — un lien ;
 * - « Le service altimétrique IGN est injoignable… » — un **message
 *   d'erreur**.
 *
 * Le §3 dit de chercher la formule et non le fichier ; c'en est l'autre
 * moitié — chercher la formule et non le mot. Ce test vise donc ce qui fait
 * d'une phrase une attribution : le symbole de droit d'auteur et le nom de
 * la licence, dans le même élément.
 */
test('la feuille porte le crédit de ses sources, en toutes lettres', async ({
  page,
}) => {
  await ouvrirUneFiche(page)
  await page.emulateMedia({ media: 'print' })

  const credit = page.getByTestId('attribution-impression')

  /*
    L'existence d'abord, comme pour l'en-tête plus haut : ce qui suit sont
    des assertions de contenu, et `toContainText` sur une requête vide
    échouerait pour la bonne raison — mais `estAlEcran` rendrait `false`
    sans qu'on sache si c'est parce que rien n'est peint ou parce que rien
    n'existe.
  */
  await expect(credit).toHaveCount(1)

  /*
    Peint, pas seulement présent. Une ligne en `display: none` porterait ce
    texte sans que le papier n'en voie rien — et c'est très exactement l'état
    d'avant ce correctif, à l'échelle de la page entière (§1bis).

    Amené dans la fenêtre d'abord : `estAlEcran` interroge
    `document.elementFromPoint`, qui ne connaît que la fenêtre. Sur papier
    il n'y a pas de fenêtre — la feuille entière est visible — donc faire
    défiler jusqu'au crédit n'affaiblit rien : c'est la seule façon de poser
    à un navigateur une question qui parle d'une page entière. Sans ce
    geste, la mesure rendrait `false` pour une fiche longue et `true` pour
    une courte, ce qui ne dit rien de l'attribution.

    Et le recouvrement, lui, reste mesuré : c'est justement ce que la ligne
    ci-dessous a trouvé au premier passage — le crédit était **dans** la
    fenêtre, à 620 px, et un `<li>` de la liste des points d'intérêt était
    peint par-dessus, parce que la mise en page d'impression restait
    épinglée à une hauteur de fenêtre.
  */
  /*
    `scrollIntoView` par le DOM, et non `scrollIntoViewIfNeeded` de
    Playwright : celui-ci attend que l'élément soit *visible* avant de
    défiler, donc sur un crédit éteint il tourne cinquante fois en cinquante
    secondes et rend « element is not visible » — vrai, mais dit par la
    mauvaise ligne, une minute trop tard, sans la phrase qui explique ce
    qu'on cherchait. Vérifié en réinjectant le défaut.

    Le geste du DOM ne juge rien : il défile, et c'est la mesure d'après qui
    tranche, avec son message.
  */
  await credit.evaluate((element) => {
    element.scrollIntoView()
  })
  expect(
    await estAlEcran(page, 'attribution-impression'),
    'le crédit existe dans le DOM mais rien ne le peint sur la feuille',
  ).toBe(true)

  await expect(credit).toContainText('©')
  await expect(credit).toContainText('ODbL')
  await expect(credit).toContainText('les contributeurs OpenStreetMap')
  await expect(credit).toContainText('IGN')
})

test('ce crédit ne se montre qu’au papier', async ({ page }) => {
  await ouvrirUneFiche(page)

  /*
    L'autre moitié, et sans elle le correctif serait une ligne de plus dans
    une interface qui n'en manque pas : le pied du panneau porte déjà le même
    crédit à l'écran, et deux fois la même phrase à l'écran serait un défaut.

    Le compte d'abord, ici aussi. J'avais écrit « la présence de l'élément
    vient d'être établie par le test précédent » — un test ne s'appuie pas
    sur son voisin, ils tournent séparément et peuvent se sauter l'un
    l'autre. Et la phrase était de la famille du §4bis : une justification
    qui a l'air d'expliquer et qui affirme. Vérifiée en retirant le crédit
    du rendu : ce test restait **vert** sur zéro élément, exactement comme
    `body > header` le faisait dans #385.
  */
  await expect(
    page.getByTestId('attribution-impression'),
    'le crédit n’existe pas : le masquage qui suit mesurerait sa propre' +
      ' requête et passerait pour rien (#385, #386)',
  ).toHaveCount(1)
  await expect(page.getByTestId('attribution-impression')).toBeHidden()

  /*
    Et le pied du panneau, lui, dit bien la même chose à l'écran — sinon le
    masquage ci-dessus retirerait le seul crédit de la page.
  */
  await expect(page.getByTestId('pied-panneau')).toContainText('ODbL')
})
