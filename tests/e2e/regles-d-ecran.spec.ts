import { test, expect, type Page } from "@playwright/test";
import {
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from "./helpers.ts";

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
  { nom: "téléphone", width: 390, height: 844, tactile: true },
  { nom: "point de rupture", width: 800, height: 900, tactile: true },
  { nom: "PC", width: 1280, height: 800, tactile: false },
] as const;

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
const ETATS = ["accueil", "zone chargée", "fiche ouverte"] as const;
type Etat = (typeof ETATS)[number];

async function atteindre(
  page: Page,
  etat: Etat,
  compact: boolean,
): Promise<void> {
  await mockExternalNetwork(page);
  await mockTilesOk(page);
  await mockElevation(page);
  await page.goto("/");
  await fermerLeGuide(page);
  if (etat === "accueil") return;

  await page.getByTestId("zone-pilat").click();
  await expect(page.getByTestId("zone-meta")).toContainText("itinéraire", {
    timeout: 15_000,
  });
  if (etat === "zone chargée") return;

  /*
    Atteindre la liste, quelle que soit la largeur, sans réécrire dans le
    test la règle qui décide où elle se trouve : on boucle sur l'état voulu
    en tentant les deux gestes (CLAUDE.md §6ter).
  */
  const liste = page.getByTestId("itinerary-list");
  await expect
    .poll(
      async () => {
        if (await liste.isVisible().catch(() => false)) return true;
        if (compact) {
          const onglet = page.getByTestId("onglet-progression");
          if (await onglet.isVisible().catch(() => false)) {
            await onglet.click().catch(() => undefined);
          }
          const poignee = page.getByTestId("sheet-handle");
          if (await poignee.isVisible().catch(() => false)) {
            await poignee.click().catch(() => undefined);
          }
        }
        return false;
      },
      { timeout: 25_000 },
    )
    .toBe(true);
  await liste.getByRole("button", { name: /GR 7/ }).first().click();
  await page.getByTestId("itinerary-card-detail-link").click();
  await expect(page.getByTestId("itinerary-detail")).toBeVisible({
    timeout: 15_000,
  });
  // Le profil arrive du réseau : sans l'attendre, on ausculte une fiche à
  // moitié rendue et l'on ne mesure rien de ce qu'on croit mesurer.
  await expect(page.getByTestId("elevation-chart")).toBeVisible({
    timeout: 15_000,
  });
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
    const cible = document.querySelector(`[data-testid="${id}"]`);
    if (!cible) return [];
    const r = cible.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return [];
    const trouves: { quoi: string; x: number; y: number }[] = [];
    for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 8; j++) {
        const x = r.x + (r.width * i) / 5;
        const y = r.y + (r.height * j) / 9;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const dessus = document.elementFromPoint(x, y);
        if (!dessus || cible === dessus || cible.contains(dessus)) continue;
        // Un ancêtre n'est pas un recouvrement : c'est le cas quand la case
        // tombe sur une zone transparente de la cible.
        if (dessus.contains(cible)) continue;
        trouves.push({
          quoi:
            dessus.getAttribute("data-testid") ??
            dessus.closest("[data-testid]")?.getAttribute("data-testid") ??
            dessus.tagName.toLowerCase(),
          x: Math.round(x),
          y: Math.round(y),
        });
      }
    }
    return trouves;
  }, testId);
}

for (const vue of LARGEURS) {
  for (const etat of ETATS) {
    test.describe(`règles d’écran — ${vue.nom}, ${etat}`, () => {
      test.use({
        viewport: { width: vue.width, height: vue.height },
        hasTouch: vue.tactile,
      });

      /**
       * Question 5. Un débordement horizontal de la page entière n'est jamais
       * voulu : il vient d'un mot trop long, d'un tableau, d'une largeur en
       * dur. Il donne un défilement latéral que personne ne cherche et qui
       * déplace tout le reste.
       */
      test("la page ne déborde jamais en largeur", async ({ page }) => {
        await atteindre(page, etat, vue.tactile);
        const debord = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(debord).toBeLessThanOrEqual(1);
      });

      /**
       * Question 2. Chaque dessin vectoriel est rendu au rapport où il a été
       * composé — sauf s'il déclare expressément le contraire par un
       * `preserveAspectRatio="none"` **et** une boîte au bon rapport, ce qui
       * n'est pas une exception mais la façon correcte d'exagérer une échelle.
       *
       * Le profil altimétrique tombait exactement là : `viewBox` 3,2 rendu
       * 4,9 pendant des semaines.
       */
      test("aucun dessin vectoriel n’est écrasé", async ({ page }) => {
        await atteindre(page, etat, vue.tactile);
        const ecrases = await page.evaluate(() => {
          const mauvais: { id: string; rendu: number; dessin: number }[] = [];
          for (const svg of Array.from(document.querySelectorAll("svg"))) {
            const vb = svg.getAttribute("viewBox");
            if (!vb) continue;
            const [, , l, h] = vb.split(/[\s,]+/).map(Number);
            if (!l || !h) continue;
            const r = svg.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) continue;
            const rendu = r.width / r.height;
            const dessin = l / h;
            if (rendu / dessin < 0.9 || rendu / dessin > 1.1) {
              mauvais.push({
                id:
                  svg.getAttribute("data-testid") ??
                  svg.getAttribute("aria-label")?.slice(0, 30) ??
                  "svg",
                rendu: Math.round(rendu * 100) / 100,
                dessin: Math.round(dessin * 100) / 100,
              });
            }
          }
          return mauvais;
        });
        expect(ecrases, `dessins écrasés : ${JSON.stringify(ecrases)}`).toEqual(
          [],
        );
      });

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
      test("les cibles font la taille du geste qui les vise", async ({
        page,
      }) => {
        await atteindre(page, etat, vue.tactile);
        // Le geste décide, pas la place : une tablette large se touche.
        const plancherHaut = vue.tactile ? 44 : 24;
        const resultat = await page.evaluate(
          ({ plancher }: { plancher: number }) => {
            const notres: { quoi: string; l: number; h: number }[] = [];
            const maplibre: { quoi: string; l: number; h: number }[] = [];
            const cibles = document.querySelectorAll(
              'button, a[href], summary, [role="button"], input[type="range"]',
            );
            for (const el of Array.from(cibles)) {
              const r = el.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              const style = getComputedStyle(el);
              if (style.visibility === "hidden" || style.display === "none") {
                continue;
              }
              if (el.tagName === "A" && el.closest("p, li, span")) continue;
              if (r.height >= plancher && r.width >= plancher) continue;
              const fiche = {
                quoi:
                  el.getAttribute("data-testid") ??
                  el.getAttribute("aria-label") ??
                  el.textContent.trim().slice(0, 28),
                l: Math.round(r.width),
                h: Math.round(r.height),
              };
              if (el.closest(".maplibregl-ctrl")) maplibre.push(fiche);
              else notres.push(fiche);
            }
            return { notres, maplibre };
          },
          { plancher: plancherHaut },
        );

        // Ce que la bibliothèque rend, relevé mais pas bloquant : voir plus haut.
        if (resultat.maplibre.length > 0) {
          console.log(
            `[maplibre ${vue.nom}] ${String(resultat.maplibre.length)} commandes sous ${String(plancherHaut)} px : ${JSON.stringify(resultat.maplibre)}`,
          );
        }

        expect(
          resultat.notres,
          `cibles sous ${String(plancherHaut)} px : ${JSON.stringify(resultat.notres)}`,
        ).toEqual([]);
      });
    });
  }
}

for (const vue of LARGEURS) {
  test.describe(`rien par-dessus les panneaux — ${vue.nom}`, () => {
    test.use({
      viewport: { width: vue.width, height: vue.height },
      hasTouch: vue.tactile,
    });

    test("la fiche reste entièrement atteignable", async ({ page }) => {
      await atteindre(page, "fiche ouverte", vue.tactile);
      const dessus = await recouvrementsDe(page, "itinerary-detail");
      expect(
        dessus,
        `fiche recouverte à ${vue.nom} par ${JSON.stringify(dessus)}`,
      ).toEqual([]);
    });
  });
}
