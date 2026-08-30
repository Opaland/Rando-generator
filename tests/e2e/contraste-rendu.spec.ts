import { test, expect, type Page } from "@playwright/test";
import {
  afficherTousLesReseaux,
  activerLeGrosTexte,
  fermerLeGuide,
  ouvrirOnglet,
  surChaqueOnglet,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from "./helpers.ts";

/**
 * Le contraste tel qu'il est **rendu**, et non tel que la palette le promet.
 *
 * `tests/unit/couleurs.test.ts` garde les jetons : il vérifie que le rouge du
 * balisage et le blanc apparié tiennent 4,5:1. Mais un jeton n'est pas un
 * écran. Entre les deux il y a l'héritage, les fonds transparents,
 * `opacity`, le mode gros texte qui redéfinit quatre couleurs, et la simple
 * possibilité qu'un texte gris ait atterri sur un fond qui n'était pas prévu
 * pour lui.
 *
 * Le seuil vient d'une norme publiée et il est nommé : **WCAG 1.4.3**, niveau
 * AA — 4,5:1 pour un texte courant, 3:1 pour un grand texte (≥ 24 px, ou
 * ≥ 18,66 px en gras). Un seuil emprunté n'a pas le même statut qu'un seuil
 * inventé (CLAUDE.md §2, §6sexies), et c'est pourquoi il est cité plutôt que
 * choisi.
 */

/**
 * Le plancher de ce que la sonde doit mesurer.
 *
 * Ce n'est pas un seuil de qualité : c'est un garde-fou contre elle-même. La
 * première version exigeait que chaque texte soit dans le cadre et peint, et
 * n'en mesurait plus que trente-huit sur deux cent cinquante — verte, en ne
 * regardant presque rien.
 *
 * Le nombre est choisi loin des deux : **mesuré 218 sur téléphone et 602 sur
 * grand écran**, quatre onglets confondus. Cent dit « quelque chose a cassé
 * dans la sonde », jamais « l'interface a un peu changé ».
 */
const MESURES_MINIMALES = 100;

const LARGEURS = [
  { nom: "téléphone", width: 390, height: 844, tactile: true },
  { nom: "PC", width: 1280, height: 800, tactile: false },
] as const;

interface Manquant {
  texte: string;
  ou: string;
  ratio: number;
  exige: number;
  couleurs: string;
}

/**
 * Ce que la sonde ne mesure pas, et pourquoi chaque exclusion est étroite.
 *
 * Une exclusion large rend une règle décorative. Chacune de celles-ci répond
 * à « la mesure serait-elle fausse ? », jamais à « le résultat me gêne ».
 */
const RAISONS_DE_NE_PAS_MESURER = `
- un texte posé **directement** sur le canevas de la carte : sa couleur de
  fond change au déplacement, et un ratio calculé sur le blanc du conteneur
  serait un chiffre faux plutôt qu'une mesure. Ce qui flotte **au-dessus** de
  la carte avec son propre fond — l'attribution, la légende — est mesuré,
  voir plus bas ;
- un contrôle désactivé : WCAG 1.4.3 les exempte explicitement, et leur
  opacité de 0,4 est ce qui *dit* qu'ils sont désactivés ;
- un fond dégradé ou en image : il n'y a pas une couleur de fond mais des
  centaines, et prendre la première serait inventer ;
- ce que le navigateur ne rend pas du tout — un accordéon replié, un titre
  de document, une option de liste : leur rectangle est nul. C'est la limite
  connue de cette sonde ; le contenu d'une section repliée n'est mesuré que
  si un autre état de l'application l'ouvre.
`.trim();

interface Releve {
  manquants: Manquant[];
  /**
   * Combien de textes ont réellement été mesurés.
   *
   * Sans ce nombre, la sonde serait verte le jour où une exclusion trop large
   * — ou un sélecteur devenu faux — lui ferait ne mesurer que trois textes.
   * Un zéro se lit exactement comme un sans-faute (§1).
   */
  mesures: number;
}

async function mesurerLesContrastes(page: Page): Promise<Releve> {
  return page.evaluate(() => {
    /** Luminance relative — WCAG 2.x, définition littérale. */
    function luminance([r, v, b]: [number, number, number]): number {
      const canal = (c: number): number => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * canal(r) + 0.7152 * canal(v) + 0.0722 * canal(b);
    }

    function ratio(
      a: [number, number, number],
      b: [number, number, number],
    ): number {
      const la = luminance(a);
      const lb = luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    function lire(couleur: string): [number, number, number, number] | null {
      const m = couleur.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/,
      );
      if (!m) return null;
      return [
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number.isFinite(Number(m[4])) ? Number(m[4]) : 1,
      ];
    }

    /** Compose une couleur semi-opaque sur celle du dessous. */
    function poser(
      dessus: [number, number, number, number],
      dessous: [number, number, number],
    ): [number, number, number] {
      const a = dessus[3];
      return [
        dessus[0] * a + dessous[0] * (1 - a),
        dessus[1] * a + dessous[1] * (1 - a),
        dessus[2] * a + dessous[2] * (1 - a),
      ];
    }

    /**
     * Le fond effectif : on remonte jusqu'à trouver de l'opaque, en
     * composant les fonds translucides rencontrés en chemin. Rend `null` dès
     * qu'un dégradé, une image ou un canevas rend la question sans réponse.
     */
    function fondEffectif(
      element: Element,
      socle: [number, number, number] | null = null,
    ): [number, number, number] | null {
      const empiles: [number, number, number, number][] = [];
      let courant: Element | null = element;
      while (courant) {
        const cs = getComputedStyle(courant);
        if (cs.backgroundImage !== "none") return null;
        const c = lire(cs.backgroundColor);
        if (c && c[3] > 0) {
          empiles.push(c);
          if (c[3] === 1) {
            let resultat: [number, number, number] = [c[0], c[1], c[2]];
            for (let i = empiles.length - 2; i >= 0; i--) {
              resultat = poser(empiles[i], resultat);
            }
            return resultat;
          }
        }
        /*
          Arrivé à la carte sans avoir trouvé d'opaque : le reste du fond est
          une tuile, pas une couleur. Continuer de remonter jusqu'au papier du
          `body` rendrait un chiffre plausible et faux.

          Un socle peut être imposé par l'appelant — c'est ainsi qu'on mesure
          l'attribution contre les deux extrêmes de ce qu'une tuile peut être.
        */
        if (courant.classList.contains("maplibregl-map")) {
          if (!socle) return null;
          let resultat = socle;
          for (let i = empiles.length - 1; i >= 0; i--) {
            resultat = poser(empiles[i], resultat);
          }
          return resultat;
        }
        courant = courant.parentElement;
      }
      return null;
    }

    const manquants: {
      texte: string;
      ou: string;
      ratio: number;
      exige: number;
      couleurs: string;
    }[] = [];
    let mesures = 0;

    for (const element of Array.from(document.querySelectorAll("*"))) {
      if (!(element instanceof HTMLElement)) continue;
      // Le texte propre à l'élément, pas celui de ses descendants : sinon un
      // conteneur porterait le texte de toute la page et sa seule couleur.
      const texte = Array.from(element.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (texte.length === 0) continue;
      if (element.closest("[disabled]") !== null) continue;
      if (element.matches(":disabled")) continue;

      /*
        Un rectangle non nul, et rien de plus.

        La première version exigeait aussi que l'élément soit **dans le
        cadre** et peint à son centre — la mesure de `estAlEcran`, reprise par
        réflexe. Elle ne mesurait alors que trente-huit textes sur deux cent
        cinquante : cent neuf étaient simplement sous la ligne de flottaison
        d'un panneau qui défile.

        Or le contraste ne dépend pas du défilement. Un texte à huit cents
        pixels du haut sera lu comme les autres, une seconde plus tard. Exiger
        qu'il soit visible *maintenant* répondait à une autre question que
        celle posée — et la sonde était verte pour l'avoir mal posée (§1bis).

        Ce qui reste exclu par le rectangle nul est ce que le navigateur ne
        rend pas du tout : un accordéon replié, un `<title>`, une `<option>`.
        Ceux-là sont une limite connue, écrite plus bas.
      */
      const r = element.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const cs = getComputedStyle(element);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      const avant = lire(cs.color);
      if (!avant) continue;

      /*
        Un texte qui flotte au-dessus de la carte est mesuré contre **les deux
        extrêmes** de ce qu'une tuile peut être : noir et blanc.

        Ce n'est pas une approximation, c'est plus fort qu'une mesure sur une
        tuile donnée — si le couple tient sur les deux, il tient sur toutes
        celles qui sont entre. Et cela n'invente rien : la seule chose posée
        est que la tuile est une couleur, ce qui est vrai par construction.

        L'attribution est précisément ce texte-là, et c'est le seul de
        l'application dont la visibilité est une obligation de licence — ODbL
        et Licence Ouverte. Il était le seul que la sonde ne regardait pas.
      */
      const surLaCarte = element.closest(".maplibregl-map") !== null;
      const socles: ([number, number, number] | null)[] = surLaCarte
        ? [
            [0, 0, 0],
            [255, 255, 255],
          ]
        : [null];

      const taille = Number.parseFloat(cs.fontSize);
      const gras = Number(cs.fontWeight) >= 700;
      // WCAG 1.4.3 : « grand texte » = 24 px, ou 18,66 px en gras.
      const exige = taille >= 24 || (gras && taille >= 18.66) ? 3 : 4.5;

      let pire: { mesure: number; fond: [number, number, number] } | null =
        null;
      for (const socle of socles) {
        const fond = fondEffectif(element, socle);
        if (!fond) continue;
        const m = ratio(poser(avant, fond), fond);
        if (!pire || m < pire.mesure) pire = { mesure: m, fond };
      }
      if (!pire) continue;
      const { mesure, fond } = pire;
      mesures++;
      if (mesure + 0.005 < exige) {
        manquants.push({
          texte: texte.slice(0, 40),
          ou: `${element.tagName.toLowerCase()}.${element.className.split(" ")[0]}`,
          ratio: Math.round(mesure * 100) / 100,
          exige,
          couleurs: `${cs.color} sur rgb(${fond.map((v) => Math.round(v)).join(", ")})`,
        });
      }
    }
    return { manquants, mesures };
  });
}

async function atteindre(
  page: Page,
  grosTexte: boolean,
  compact: boolean,
  sombre = false,
): Promise<void> {
  await mockExternalNetwork(page);
  await mockTilesOk(page);
  await mockElevation(page);
  await page.emulateMedia({
    reducedMotion: "reduce",
    // La préférence système, celle que #361 suit. `emulateMedia` la pose au
    // niveau du navigateur : c'est la même bascule qu'un téléphone en thème
    // sombre, pas une classe posée à la main sur `<html>`.
    colorScheme: sombre ? "dark" : "light",
  });
  await page.goto("/");
  await fermerLeGuide(page);
  if (grosTexte) {
    await activerLeGrosTexte(page, compact);
    /*
      Le réglage vit sous « Réglages », et sur téléphone l'onglet **filtre** :
      y aller retire de l'écran le sélecteur de zone. On revient donc sur
      « Carte », comme le ferait quelqu'un qui vient d'agrandir les textes et
      veut maintenant charger un secteur.

      Sans ce retour, la sonde attendait un bouton qu'elle avait elle-même
      fait disparaître — et un échec de mise en place se lit comme un défaut
      de contraste.
    */
    if (compact) await ouvrirOnglet(page, "carte");
  }
  await page.getByTestId("zone-pilat").click();
  await expect(page.getByTestId("zone-meta")).toContainText("itinéraire", {
    timeout: 15_000,
  });
  await afficherTousLesReseaux(page);
}

/*
  Quatre combinaisons de plus depuis #361 : le thème sombre double la matrice.

  Ce n'est pas de la symétrie pour la symétrie. Le mode « sombre + gros
  texte » est celui où les valeurs se contredisent — le gros texte
  **assombrit** pour renforcer sur du papier, ce qui rend le texte moins
  lisible sur fond sombre —, et c'est exactement le genre de mode qu'une sonde
  oublie. Le §6quinquies le dit d'un état ; il vaut d'un thème.
*/
for (const vue of LARGEURS) {
  for (const grosTexte of [false, true]) {
    for (const sombre of [false, true]) {
      test.describe(`contraste rendu — ${vue.nom}${grosTexte ? ", gros texte" : ""}${sombre ? ", sombre" : ""}`, () => {
        test.use({
          viewport: { width: vue.width, height: vue.height },
          hasTouch: vue.tactile,
        });

        /**
         * Le mode gros texte n'est pas décoratif ici : il **redéfinit quatre
         * couleurs** (`--gris-vert`, `--gris-vert-clair`, `--orange-grp`,
         * `--jaune-pr`) pour renforcer le contraste. Une palette renforcée
         * qui ne serait pas mesurée serait une promesse, pas un renfort.
         */
        test("chaque texte tient le seuil WCAG 1.4.3 AA", async ({ page }) => {
          await atteindre(page, grosTexte, vue.tactile, sombre);
          /*
          On parcourt les quatre onglets.

          Sur téléphone, l'onglet **filtre** : rester sur « Carte » ne
          montrait qu'un quart de l'application, et la sonde y mesurait
          cinquante-huit textes là où l'écran large en offrait cent
          quarante-sept. Une sonde qui ne regarde qu'un onglet ne garde qu'un
          onglet — c'est la leçon du §6quinquies, transposée.

          Sur grand écran la barre existe mais ne filtre pas : la boucle y
          remesure quatre fois la même page. C'est du gaspillage de quelques
          millisecondes, et c'est le prix d'un test qui n'a pas à savoir dans
          quelle disposition il tourne.
        */
          const tous: Manquant[] = [];
          let mesures = 0;
          await surChaqueOnglet(page, async () => {
            const releve = await mesurerLesContrastes(page);
            mesures += releve.mesures;
            tous.push(...releve.manquants);
          });
          const vus = new Set<string>();
          const manquants = tous.filter((m) => {
            const cle = `${m.ou}|${m.texte}`;
            if (vus.has(cle)) return false;
            vus.add(cle);
            return true;
          });

          expect(
            mesures,
            "la sonde ne mesure presque plus rien : exclusion trop large, ou sélecteur devenu faux",
          ).toBeGreaterThan(MESURES_MINIMALES);
          expect(
            manquants,
            `sous le seuil :\n${manquants
              .map(
                (m) =>
                  `  ${m.ratio}:1 (exigé ${m.exige}) — « ${m.texte} » ${m.ou} — ${m.couleurs}`,
              )
              .join("\n")}\n\nNon mesuré :\n${RAISONS_DE_NE_PAS_MESURER}`,
          ).toEqual([]);
        });
      });
    }
  }
}
