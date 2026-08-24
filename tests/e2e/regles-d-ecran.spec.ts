import { test, expect, type Page } from '@playwright/test'
import {
  activerLeGrosTexte,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from './helpers.ts'

/**
 * Les règles d'écran — l'audit devenu suite, plutôt que document.
 *
 * ## Pourquoi ce fichier existe
 *
 * Le 24/08, Cédric a vu en trois secondes deux défauts que j'aurais dû voir
 * depuis longtemps : un profil altimétrique écrasé de trente pour cent, et
 * une fiche dont le quart bas était peint par la poignée et les onglets.
 * Aucun des deux n'était subtil. Aucun des deux n'avait de test — parce que
 * chaque test existant vérifiait *une chose voulue à un endroit*, et que
 * personne ne posait la question générale.
 *
 * Un document d'audit aurait listé ces deux-là et vieilli. Ce fichier pose
 * les **questions** à la place, et les repose à chaque exécution, sur toutes
 * les surfaces et à toutes les largeurs. C'est la différence entre avoir
 * regardé et pouvoir regarder.
 *
 * ## Les cinq questions
 *
 * 1. **Qu'est-ce qui est peint par-dessus quoi ?** Un panneau recouvert garde
 *    un rectangle parfaitement valide : `toBeVisible` dit oui, et le contenu
 *    est pourtant inatteignable (CLAUDE.md §1bis).
 * 2. **Qu'est-ce qui est écrasé ?** Un dessin vectoriel rendu à un autre
 *    rapport que celui où il a été composé ment sur ce qu'il montre.
 * 3. **Qu'est-ce qui déborde sans le dire ?** Les navigateurs ne dessinent
 *    plus de barre permanente : un texte coupé au ras du bord se lit comme un
 *    texte fini.
 * 4. **Qu'est-ce qu'on ne peut pas toucher ?** Quarante-quatre pixels, plancher
 *    de l'audit mobile.
 * 5. **Qu'est-ce qui sort du cadre ?** Un débordement horizontal de la page
 *    entière est toujours un défaut, jamais une intention.
 *
 * ## Ce que ce fichier n'est pas
 *
 * Il ne juge pas le goût. Il ne dit pas si une couleur est jolie ni si un
 * texte est clair — ces choses-là se décident, elles ne se mesurent pas, et
 * les prétendre mesurables serait le genre de faux confort que CLAUDE.md §2
 * interdit. Il ne garde que ce qui a une réponse en chiffres.
 */

/**
 * Trois écrans, et **le geste qui va avec**.
 *
 * `hasTouch` n'est pas un détail de confort : le plancher des cibles est posé
 * sous `@media (pointer: coarse)`, et une fenêtre de 390 px pilotée à la
 * souris n'est pas un téléphone. Sans cette émulation, la suite mesurait le
 * plancher de bureau en croyant mesurer celui du doigt — un test qui répond
 * à une autre question que celle qu'on croit poser (CLAUDE.md §1bis).
 *
 * Trouvé en corrigeant : les hauteurs restaient à 32 px après un correctif
 * qui les portait à 44, et c'était le test qui avait tort.
 */
const LARGEURS = [
  { nom: 'téléphone', width: 390, height: 844, tactile: true },
  { nom: 'point de rupture', width: 800, height: 900, tactile: true },
  { nom: 'PC', width: 1280, height: 800, tactile: false },
] as const

/**
 * Les états où l'on ausculte.
 *
 * Une première version n'examinait que l'écran d'accueil — et une injection
 * l'a démasquée : le profil altimétrique réécrasé passait au vert, parce
 * qu'il n'est pas encore dans le document à ce moment-là. Une règle qui ne
 * regarde qu'un écran ne garde qu'un écran.
 *
 * Trois états, choisis parce qu'ils sont les trois moments où l'on se sert
 * de l'application : on arrive, on charge une zone, on ouvre une fiche.
 */
const ETATS = ['accueil', 'zone chargée', 'fiche ouverte'] as const
type Etat = (typeof ETATS)[number]

async function atteindre(
  page: Page,
  etat: Etat,
  compact: boolean,
): Promise<void> {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)
  if (etat === 'accueil') return

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  if (etat === 'zone chargée') return
  await ouvrirLaFiche(page, compact)
}

/**
 * Ouvrir la fiche détail, quelle que soit la largeur.
 *
 * Séparé d'`atteindre` parce que **l'ordre compte** : un réglage se pose
 * avant d'ouvrir la fiche, comme une personne le fait — et parce que la
 * fiche ouverte recouvre le panneau des réglages, si bien que l'inverse ne
 * marche pas du tout. Le test l'a appris en essayant.
 */
async function ouvrirLaFiche(page: Page, compact: boolean): Promise<void> {
  /*
    On boucle sur **l'état final voulu** — la fiche est ouverte — en tentant
    chaque geste à chaque tour, plutôt que de chercher un ordre sûr
    (CLAUDE.md §6ter).

    La première version demandait « la liste est-elle visible ? » puis
    cliquait. Elle a marché jusqu'à ce que le mode gros texte replie la
    feuille : `isVisible` répondait **oui** sur une liste écrêtée par un
    ancêtre en `overflow: hidden`, et le clic tombait sur la poignée, qui
    interceptait. C'est le §1bis, dans le test qui existe pour l'appliquer.

    Aucun de ces clics n'est asserté : c'est la convergence qui l'est. Un
    `catch` ici n'avale pas une assertion, il avale une tentative.
  */
  const fiche = page.getByTestId('itinerary-detail')
  await expect
    .poll(
      async () => {
        if (await fiche.isVisible().catch(() => false)) return true

        if (compact) {
          for (const cible of ['onglet-progression', 'sheet-handle']) {
            await page
              .getByTestId(cible)
              .click({ timeout: 1_000 })
              .catch(() => undefined)
          }
        }
        await page
          .getByTestId('itinerary-list')
          .getByRole('button', { name: /GR 7/ })
          .first()
          .click({ timeout: 1_500 })
          .catch(() => undefined)
        await page
          .getByTestId('itinerary-card-detail-link')
          .click({ timeout: 1_500 })
          .catch(() => undefined)
        return false
      },
      { timeout: 30_000 },
    )
    .toBe(true)

  // Le profil arrive du réseau : sans l'attendre, on ausculte une fiche à
  // moitié rendue et l'on ne mesure rien de ce qu'on croit mesurer.
  await expect(page.getByTestId('elevation-chart')).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * Ce qui est peint au centre de chaque case d'un quadrillage posé sur un
 * élément, quand ce n'est pas lui.
 *
 * `elementFromPoint` répond à la seule question qui compte — « qu'est-ce que
 * le doigt touchera ici » — là où les rectangles n'y répondent pas.
 */
async function recouvrementsDe(page: Page, testId: string) {
  return page.evaluate((id: string) => {
    const cible = document.querySelector(`[data-testid="${id}"]`)
    if (!cible) return []
    const r = cible.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return []
    const trouves: { quoi: string; x: number; y: number }[] = []
    for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 8; j++) {
        const x = r.x + (r.width * i) / 5
        const y = r.y + (r.height * j) / 9
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
        const dessus = document.elementFromPoint(x, y)
        if (!dessus || cible === dessus || cible.contains(dessus)) continue
        // Un ancêtre n'est pas un recouvrement : c'est le cas quand la case
        // tombe sur une zone transparente de la cible.
        if (dessus.contains(cible)) continue
        trouves.push({
          quoi:
            dessus.getAttribute('data-testid') ??
            dessus.closest('[data-testid]')?.getAttribute('data-testid') ??
            dessus.tagName.toLowerCase(),
          x: Math.round(x),
          y: Math.round(y),
        })
      }
    }
    return trouves
  }, testId)
}

/**
 * Ce qui déborde en largeur — la page **et** chacun de ses conteneurs.
 *
 * Nommée plutôt que recopiée. Elle l'était : une copie dans les règles
 * générales, une autre dans le bloc « gros texte ». J'ai corrigé la première
 * et laissé la seconde, si bien qu'une injection franche — un en-tête
 * d'accordéon à mille six cents pixels — restait verte dans le mode même
 * qu'elle visait. Trois gardes recopiées et une quatrième oubliée, c'est le
 * mode d'échec de CLAUDE.md §4, et il s'est produit dans le fichier écrit
 * pour l'empêcher.
 */
async function debordementsEnLargeur(page: Page) {
  return page.evaluate(() => {
    const trouves: { quoi: string; contenu: number; cadre: number }[] = []

    // La page entière, d'abord : un défilement latéral que personne ne
    // cherche et qui déplace tout le reste.
    const racine = document.documentElement
    if (racine.scrollWidth > window.innerWidth + 1) {
      trouves.push({
        quoi: 'la page',
        contenu: racine.scrollWidth,
        cadre: window.innerWidth,
      })
    }

    /*
      Puis **chaque conteneur**. Un en-tête trop large posé dans la colonne
      latérale ne fait pas déborder la page : la colonne le rogne, et le
      `scrollWidth` du document ne bouge pas. Le texte, lui, est coupé et
      inatteignable.

      `overflow-x: hidden` est le cas dangereux — coupé sans recours. `auto`
      et `scroll` sont comptés aussi : rien ici n'a de raison de défiler
      latéralement, et un panneau qui s'y met est un accident.
    */
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!(el instanceof HTMLElement)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      if (el.scrollWidth <= el.clientWidth + 2) continue
      const style = getComputedStyle(el)
      if (style.overflowX === 'visible') continue
      // La carte gère son propre débordement : sa toile est plus large que
      // le cadre par construction, c'est ainsi qu'on la déplace.
      if (el.closest('.maplibregl-map')) continue
      /*
        Une troncature **déclarée** n'est pas un rognage.

        `text-overflow: ellipsis` avec `white-space: nowrap` dit « coupe et
        montre des points de suspension » : c'est une décision de mise en
        page, et le lecteur voit qu'il manque quelque chose. Un rognage sans
        marque, lui, ment.

        Trouvé le 24/08 : la sonde dénonçait le sous-titre d'un itinéraire
        dans la liste — 233 px de nom dans 214 — alors qu'il s'élide comme
        prévu. Une règle qui rougit sur une intention finit désactivée, et ne
        garde alors plus rien.

        Reste une question qu'aucune mesure ne tranche, et qui appartient à
        une personne : **en gros texte, élider davantage va-t-il contre le
        but** ? Celui qui agrandit les textes est justement celui qui lit
        mal. C'est écrit dans `docs/AUDIT_UX_24_08.md` plutôt qu'inventé ici.
      */
      if (style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap') {
        continue
      }
      trouves.push({
        quoi:
          el.getAttribute('data-testid') ??
          `${el.tagName.toLowerCase()}.${el.className.slice(0, 24)}`,
        contenu: el.scrollWidth,
        cadre: el.clientWidth,
      })
    }
    return trouves
  })
}

for (const vue of LARGEURS) {
  for (const etat of ETATS) {
    test.describe(`règles d’écran — ${vue.nom}, ${etat}`, () => {
      test.use({
        viewport: { width: vue.width, height: vue.height },
        hasTouch: vue.tactile,
      })

      /**
       * Question 5. Un débordement horizontal de la page entière n'est jamais
       * voulu : il vient d'un mot trop long, d'un tableau, d'une largeur en
       * dur. Il donne un défilement latéral que personne ne cherche et qui
       * déplace tout le reste.
       */
      test('rien ne déborde en largeur, ni la page ni ses panneaux', async ({
        page,
      }) => {
        await atteindre(page, etat, vue.tactile)
        const debords = await debordementsEnLargeur(page)
        expect(
          debords,
          `débordements en largeur : ${JSON.stringify(debords)}`,
        ).toEqual([])
      })

      /**
       * Question 2. Chaque dessin vectoriel est rendu au rapport où il a été
       * composé — sauf s'il déclare expressément le contraire par un
       * `preserveAspectRatio="none"` **et** une boîte au bon rapport, ce qui
       * n'est pas une exception mais la façon correcte d'exagérer une échelle.
       *
       * Le profil altimétrique tombait exactement là : `viewBox` 3,2 rendu
       * 4,9 pendant des semaines.
       */
      test('aucun dessin vectoriel n’est écrasé', async ({ page }) => {
        await atteindre(page, etat, vue.tactile)
        const ecrases = await page.evaluate(() => {
          const mauvais: { id: string; rendu: number; dessin: number }[] = []
          for (const svg of Array.from(document.querySelectorAll('svg'))) {
            const vb = svg.getAttribute('viewBox')
            if (!vb) continue
            const [, , l, h] = vb.split(/[\s,]+/).map(Number)
            if (!l || !h) continue
            const r = svg.getBoundingClientRect()
            if (r.width < 8 || r.height < 8) continue
            const rendu = r.width / r.height
            const dessin = l / h
            if (rendu / dessin < 0.9 || rendu / dessin > 1.1) {
              mauvais.push({
                id:
                  svg.getAttribute('data-testid') ??
                  svg.getAttribute('aria-label')?.slice(0, 30) ??
                  'svg',
                rendu: Math.round(rendu * 100) / 100,
                dessin: Math.round(dessin * 100) / 100,
              })
            }
          }
          return mauvais
        })
        expect(ecrases, `dessins écrasés : ${JSON.stringify(ecrases)}`).toEqual(
          [],
        )
      })

      /**
       * Question 4. Deux seuils, parce que les normes en donnent deux — et
       * qu'un seuil unique aurait été soit inapplicable, soit inutile.
       *
       * - **44 px sous le point de rupture** : c'est un doigt. WCAG 2.5.5
       *   (niveau AAA) le pose, l'audit mobile de ce dépôt aussi, et la barre
       *   d'onglets le respecte déjà.
       * - **24 px au-dessus** : c'est un curseur. WCAG 2.5.8, ajouté en 2.2 au
       *   niveau AA précisément parce que 44 px partout dévaste une interface
       *   dense de bureau.
       *
       * Ce sont des seuils de **présentation** et ils viennent d'une norme
       * publiée, pas de mon jugement — c'est la différence que CLAUDE.md §2
       * demande de faire.
       *
       * Deux exclusions, et il faut dire pourquoi :
       *
       * - **un lien dans une phrase** n'est pas une cible tactile mais du texte
       *   cliquable ; l'exiger à 44 px casserait le paragraphe, et WCAG 2.5.8
       *   l'exclut nommément ;
       * - **les liens d'attribution de MapLibre** — même raison de fond, plus
       *   une raison technique : ce sont des boîtes en ligne, sur lesquelles
       *   `min-height` n'a aucun effet.
       *
       * Les **boutons** de MapLibre, eux, sont dans le compte : zoom, boussole,
       * bascule d'attribution. Ils sont dans notre DOM et sous notre doigt, et
       * ils étaient à 29 px. Ce qui reste listé sans bloquer est donc réduit
       * aux liens d'attribution — assez peu pour que la liste garde un sens.
       */
      test('les cibles font la taille du geste qui les vise', async ({
        page,
      }) => {
        await atteindre(page, etat, vue.tactile)
        // Le geste décide, pas la place : une tablette large se touche.
        const plancherHaut = vue.tactile ? 44 : 24
        const resultat = await page.evaluate(
          ({ plancher }: { plancher: number }) => {
            const notres: { quoi: string; l: number; h: number }[] = []
            const maplibre: { quoi: string; l: number; h: number }[] = []
            const cibles = document.querySelectorAll(
              'button, a[href], summary, [role="button"], input[type="range"]',
            )
            for (const el of Array.from(cibles)) {
              const r = el.getBoundingClientRect()
              if (r.width < 2 || r.height < 2) continue
              const style = getComputedStyle(el)
              if (style.visibility === 'hidden' || style.display === 'none') {
                continue
              }
              if (el.tagName === 'A' && el.closest('p, li, span')) continue
              if (r.height >= plancher && r.width >= plancher) continue
              const fiche = {
                quoi:
                  el.getAttribute('data-testid') ??
                  el.getAttribute('aria-label') ??
                  el.textContent.trim().slice(0, 28),
                l: Math.round(r.width),
                h: Math.round(r.height),
              }
              if (el.closest('.maplibregl-ctrl')) maplibre.push(fiche)
              else notres.push(fiche)
            }
            return { notres, maplibre }
          },
          { plancher: plancherHaut },
        )

        // Ce que la bibliothèque rend, relevé mais pas bloquant : voir plus haut.
        if (resultat.maplibre.length > 0) {
          console.log(
            `[maplibre ${vue.nom}] ${String(resultat.maplibre.length)} commandes sous ${String(plancherHaut)} px : ${JSON.stringify(resultat.maplibre)}`,
          )
        }

        expect(
          resultat.notres,
          `cibles sous ${String(plancherHaut)} px : ${JSON.stringify(resultat.notres)}`,
        ).toEqual([])
      })
    })
  }
}

for (const vue of LARGEURS) {
  test.describe(`rien par-dessus les panneaux — ${vue.nom}`, () => {
    test.use({
      viewport: { width: vue.width, height: vue.height },
      hasTouch: vue.tactile,
    })

    test('la fiche reste entièrement atteignable', async ({ page }) => {
      await atteindre(page, 'fiche ouverte', vue.tactile)
      const dessus = await recouvrementsDe(page, 'itinerary-detail')
      expect(
        dessus,
        `fiche recouverte à ${vue.nom} par ${JSON.stringify(dessus)}`,
      ).toEqual([])
    })
  })
}

/**
 * Les mêmes questions, en gros texte.
 *
 * L'application propose d'agrandir les textes (issue #173) — pour Théo, qui
 * lit mal de près, et pour tous ceux qui regardent un écran au soleil, à
 * bout de bras, en montagne. C'est un mode que personne n'avait ausculté :
 * les règles d'écran tournaient sur la taille par défaut, c'est-à-dire sur
 * la seule configuration où l'on est sûr que tout tient.
 *
 * Or agrandir les textes est exactement ce qui fait déborder une page,
 * écrase un dessin dont la boîte est fixe, et pousse un bouton hors du
 * cadre. Un mode d'accessibilité non testé est une promesse d'accessibilité,
 * pas une accessibilité.
 *
 * Deux largeurs, l'état le plus dense : c'est là que la place manque.
 */
const AVEC_GROS_TEXTE = [
  { nom: 'téléphone', width: 390, height: 844, tactile: true },
  { nom: 'PC', width: 1280, height: 800, tactile: false },
] as const

for (const vue of AVEC_GROS_TEXTE) {
  test.describe(`gros texte — ${vue.nom}`, () => {
    test.use({
      viewport: { width: vue.width, height: vue.height },
      hasTouch: vue.tactile,
    })

    test('rien ne déborde en largeur', async ({ page }) => {
      await atteindre(page, 'zone chargée', vue.tactile)
      await activerLeGrosTexte(page, vue.tactile)
      const debords = await debordementsEnLargeur(page)
      expect(
        debords,
        `débordements en gros texte : ${JSON.stringify(debords)}`,
      ).toEqual([])
    })

    test('le profil n’est pas écrasé', async ({ page }) => {
      await atteindre(page, 'zone chargée', vue.tactile)
      await activerLeGrosTexte(page, vue.tactile)
      await ouvrirLaFiche(page, vue.tactile)
      const ecrases = await page.evaluate(() => {
        const mauvais: { id: string; rendu: number; dessin: number }[] = []
        for (const svg of Array.from(document.querySelectorAll('svg'))) {
          const vb = svg.getAttribute('viewBox')
          if (!vb) continue
          const [, , l, h] = vb.split(/[\s,]+/).map(Number)
          if (!l || !h) continue
          const r = svg.getBoundingClientRect()
          if (r.width < 8 || r.height < 8) continue
          const rendu = r.width / r.height
          const dessin = l / h
          if (rendu / dessin < 0.9 || rendu / dessin > 1.1) {
            mauvais.push({
              id: svg.getAttribute('data-testid') ?? 'svg',
              rendu: Math.round(rendu * 100) / 100,
              dessin: Math.round(dessin * 100) / 100,
            })
          }
        }
        return mauvais
      })
      expect(ecrases, `dessins écrasés : ${JSON.stringify(ecrases)}`).toEqual(
        [],
      )
    })

    /**
     * Le cas qui motive tout le reste : agrandir les textes grandit les
     * boutons, et un bouton qui grandit peut sortir de son conteneur ou
     * chevaucher son voisin. On mesure ce qui est **peint**, pas ce qui est
     * déclaré.
     */
    test('la fiche reste entièrement atteignable', async ({ page }) => {
      await atteindre(page, 'zone chargée', vue.tactile)
      await activerLeGrosTexte(page, vue.tactile)
      await ouvrirLaFiche(page, vue.tactile)
      const dessus = await recouvrementsDe(page, 'itinerary-detail')
      expect(
        dessus,
        `fiche recouverte en gros texte à ${vue.nom} par ${JSON.stringify(dessus)}`,
      ).toEqual([])
    })
  })
}
