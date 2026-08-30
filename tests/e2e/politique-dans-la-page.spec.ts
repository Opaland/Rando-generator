import { test, expect } from '@playwright/test'

/**
 * La politique de sécurité arrive-t-elle jusqu'à la page ? (issue #375)
 *
 * ## Le constat
 *
 * `deploy/csp.conf` est une source unique soignée, lue par nginx et par le
 * serveur de prévisualisation, gardée dans les deux sens par
 * `tests/unit/csp.test.ts` contre `HOTES_CONTACTES`. Les tests de bout en
 * bout tournent sous elle.
 *
 * Et sur `opaland.github.io`, `curl` ne rendait **ni en-tête ni balise**.
 * Tout ce travail protégeait le serveur de prévisualisation et une image
 * conteneur que rien ne déploie — c'est-à-dire deux portes où personne ne
 * passe.
 *
 * Le dépôt en avait tiré « Pages ne laisse poser aucun en-tête, donc rien à
 * faire ». C'est vrai des en-têtes ; une balise `<meta http-equiv>` n'en est
 * pas un.
 *
 * ## Ce que ce fichier mesure, et pourquoi ainsi
 *
 * Il **ne recopie aucune liste d'hôtes**. Il compare la balise à l'en-tête
 * que le même serveur envoie — les deux sortent de `politiqueDeSecurite()`,
 * donc du même fichier. La chaîne est : `csp.test.ts` garde le fichier
 * contre ce que l'application contacte, et ce fichier-ci garde la balise
 * contre le fichier.
 *
 * Recopier `HOTES_CONTACTES` ici en aurait fait une jumelle de plus, et
 * quatre instances de #367 viennent de dire ce que ça coûte (§4ter).
 */

/** Découpe une politique en directives, sans se soucier de l'espacement. */
function directives(politique: string): Map<string, string> {
  const par = new Map<string, string>()
  for (const morceau of politique.split(';')) {
    const propre = morceau.trim()
    if (propre === '') continue
    const nom = propre.split(/\s+/)[0] ?? ''
    par.set(nom, propre)
  }
  return par
}

/**
 * Ce qu'une balise ne peut pas porter — la spécification les ignore, elles
 * n'ont de sens que dans un en-tête.
 *
 * Nommées ici **une fois**, avec ce qu'on en attend : `frame-ancestors` est
 * la seule que la politique de Sentiers emploie, donc la seule perte réelle
 * sur GitHub Pages. Le déménagement vers un vrai serveur garde sa raison
 * d'être, et cette ligne est là pour que personne ne l'oublie.
 */
const PERDUES_EN_BALISE = ['frame-ancestors', 'report-uri', 'sandbox']

test('la page porte la politique, et pas seulement le serveur', async ({
  page,
}) => {
  const reponse = await page.goto('/')
  expect(reponse).not.toBeNull()

  const enTete = reponse?.headers()['content-security-policy'] ?? ''
  expect(
    enTete,
    "Le serveur de prévisualisation n'envoie plus d'en-tête de politique :" +
      ' ce test comparerait la balise à rien du tout.',
  ).not.toBe('')

  const balise = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')

  expect(
    balise,
    'La page ne porte aucune balise de politique. Sur GitHub Pages, où aucun' +
      " en-tête n'est possible, elle serait donc servie sans politique du" +
      ' tout — c’est le constat de #375.',
  ).not.toBeNull()

  const duServeur = directives(enTete)
  const deLaBalise = directives(balise ?? '')

  /*
    Aucune invention : ce que la balise dit, le fichier le disait déjà. C'est
    ce qui rend inutile de recopier la liste des hôtes ici.
  */
  for (const [nom, texte] of deLaBalise) {
    expect(
      duServeur.get(nom),
      `La balise porte « ${texte} », que l'en-tête ne porte pas. Elle a donc` +
        ' cessé d’être dérivée de deploy/csp.conf.',
    ).toBe(texte)
  }

  /*
    Et rien ne manque, sauf ce qu'une balise ne peut pas porter. C'est
    l'autre moitié : sans elle, une balise vide passerait le test précédent.
  */
  const manquantes = [...duServeur.keys()].filter((nom) => !deLaBalise.has(nom))
  expect(
    manquantes.sort(),
    'La balise perd des directives que le serveur applique, au-delà de celles' +
      " qu'une balise ne peut pas porter.",
  ).toEqual(manquantes.filter((nom) => PERDUES_EN_BALISE.includes(nom)).sort())

  /*
    Nommément : la promesse du produit passe par `connect-src`, et c'est
    précisément la directive qu'une balise sait porter. Si un jour elle
    disparaissait de la balise, les deux contrôles ci-dessus resteraient
    verts — l'un ne verrait rien en trop, l'autre la compterait comme une
    perte acceptable seulement si elle figurait dans PERDUES_EN_BALISE. Elle
    n'y est pas, mais l'écrire noir sur blanc coûte une ligne.
  */
  expect(
    deLaBalise.has('connect-src'),
    'La balise ne porte pas `connect-src` : c’est la directive qui rend' +
      ' vérifiable « aucune donnée ne sort », et la seule raison pour' +
      ' laquelle cette balise existe.',
  ).toBe(true)
})

/**
 * Une seule balise, et pas trois (#420).
 *
 * Le greffon ajoutait la balise sans regarder si elle était là. Deux
 * constructions qui se chevauchent ont produit **trois** balises identiques
 * dans `dist/pourquoi.html` — et ce test-ci n'existait pas : c'est le
 * sélecteur du test suivant qui a rougi, en résolvant trois éléments là où il
 * en attendait un. Un échec qui dit « la page ne porte pas de politique »
 * alors qu'elle en porte trois n'aide personne.
 *
 * Trois copies d'une même politique n'ont rien cassé. Deux politiques
 * **différentes** empilées, si : le navigateur applique leur intersection,
 * donc la plus stricte, et une politique trop stricte rend la carte grise.
 */
for (const page_ of ['/', '/pourquoi.html'] as const) {
  test(`${page_} ne porte qu’une politique`, async ({ page }) => {
    await page.goto(page_)
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy"]'),
      'Plusieurs balises de politique sur la même page : le navigateur en' +
        ' appliquerait l’intersection, c’est-à-dire la plus stricte, sans que' +
        ' rien ne le dise (#420).',
    ).toHaveCount(1)
  })
}

test('la page « pourquoi » la porte aussi', async ({ page }) => {
  /*
    Elle est servie telle quelle, hors du bundle — donc hors de tout ce que
    Vite transforme. C'est exactement le genre de fichier qu'une correction
    oublie, et le §3 dit de vérifier toutes les surfaces plutôt qu'une.
  */
  await page.goto('/pourquoi.html')
  const balise = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')

  expect(
    balise,
    'La page publique « pourquoi » ne porte pas de politique alors que' +
      " l'application en porte une. Elle est servie hors du bundle : c'est la" +
      ' surface qu’une correction oublie (§3).',
  ).not.toBeNull()
})
