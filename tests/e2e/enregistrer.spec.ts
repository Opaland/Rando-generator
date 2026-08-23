import { test, expect, type Page } from "@playwright/test";
import {
  mockExternalNetwork,
  fermerLeGuide,
  installerGeolocalisationPilotee,
  emettrePosition,
  suivisDePosition,
  pointsEnBase,
} from "./helpers.ts";

/**
 * Issue #152 — Sentiers enregistre une sortie.
 *
 * Le seul problème existentiel du produit, d'après l'audit externe du
 * 20/08 : jusqu'ici, pour voir sa progression, il fallait enregistrer sa
 * sortie dans Strava ou Garmin, l'exporter et l'importer ici. La
 * proposition de valeur dépendait d'un concurrent.
 *
 * Ce fichier suit la boucle entière, du bouton « Démarrer » jusqu'à la
 * trace rangée avec les autres — et le chemin de traverse qui compte
 * autant : l'onglet tué en pleine randonnée.
 */

/** Sur le GR 7 de la fixture Pilat, en montant de dix mètres par pas. */
function pas(n: number) {
  return { lon: 4.505 + n * 0.001, lat: 45.4, altitude: 200 + n * 10 };
}

async function marcher(page: Page, jusqua: number, depuis = 1): Promise<void> {
  for (let n = depuis; n <= jusqua; n++) {
    await emettrePosition(page, pas(n));
  }
}

/**
 * Combien de lignes de trace ont été poussées dans la carte.
 *
 * On lit le témoin que `useMapSources` publie déjà, et non la source
 * MapLibre : le navigateur d'intégration n'a pas toujours WebGL, et
 * interroger la carte rendrait le test dépendant du fond de carte au lieu
 * des données.
 */
async function tracesSurLaCarte(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __sentiersTrailStats?: { traces: number } })
        .__sentiersTrailStats?.traces ?? -1,
  );
}

async function ouvrir(page: Page): Promise<void> {
  await mockExternalNetwork(page);
  await installerGeolocalisationPilotee(page);
  await page.goto("/");
  await fermerLeGuide(page);
}

test("enregistrer une sortie, la mettre en pause, la terminer", async ({
  page,
}) => {
  await ouvrir(page);
  const listeDesTraces = page.getByTestId("tracks-list").getByRole("listitem");
  const tracesAvant = await listeDesTraces.count();

  await page.getByTestId("sortie-demarrer").click();
  // Les chiffres apparaissent avant la première position : la sortie a
  // commencé, et l'écran le dit plutôt que de rester vide.
  await expect(page.getByTestId("sortie-chiffres")).toBeVisible();
  await expect(page.getByTestId("sortie-attente")).toBeVisible();

  await marcher(page, 4);
  await expect(page.getByTestId("sortie-attente")).toHaveCount(0);
  // `toHaveText` et non `toContainText` : « 160 m » **contient** « 0 m ».
  // L'assertion d'origine passait pour la mauvaise raison, et ne s'est vue
  // que le jour où la distance s'est mise à s'afficher en mètres.
  await expect(page.getByTestId("sortie-distance")).not.toHaveText("0 m");
  // Quatre pas de dix mètres, avec l'hystérésis de l'import : 30 m.
  await expect(page.getByTestId("sortie-denivele")).toHaveText("30 m");

  // La pause fige le chronomètre de marche.
  await page.getByTestId("sortie-pause").click();
  await expect(page.getByTestId("sortie-reprendre")).toBeVisible();
  const dureeALaPause = await page.getByTestId("sortie-duree").textContent();
  await page.waitForTimeout(2_500);
  expect(await page.getByTestId("sortie-duree").textContent()).toBe(
    dureeALaPause,
  );

  // Et une position reçue pendant la pause ne compte pas : le téléphone
  // continue d'émettre pendant qu'on boit un café.
  const distanceALaPause = await page
    .getByTestId("sortie-distance")
    .textContent();
  await emettrePosition(page, pas(40));
  await page.waitForTimeout(200);
  expect(await page.getByTestId("sortie-distance").textContent()).toBe(
    distanceALaPause,
  );

  await page.getByTestId("sortie-terminer").click();

  // La sortie est rangée avec les autres : à partir d'ici, c'est une trace
  // comme une autre — appariée, comptée, exportable.
  await expect(page.getByTestId("sortie-demarrer")).toBeVisible();
  await expect
    .poll(() => listeDesTraces.count(), { timeout: 15_000 })
    .toBe(tracesAvant + 1);
  await expect(listeDesTraces.last()).toContainText("Sortie enregistrée");
});

test("une sortie abandonnée ne laisse aucune trace", async ({ page }) => {
  await ouvrir(page);
  await expect(page.getByTestId("tracks-empty")).toBeVisible();

  await page.getByTestId("sortie-demarrer").click();
  await marcher(page, 3);
  // `toHaveText` et non `toContainText` : « 160 m » **contient** « 0 m ».
  // L'assertion d'origine passait pour la mauvaise raison, et ne s'est vue
  // que le jour où la distance s'est mise à s'afficher en mètres.
  await expect(page.getByTestId("sortie-distance")).not.toHaveText("0 m");

  await page.getByTestId("sortie-abandonner").click();
  await expect(page.getByTestId("sortie-demarrer")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("tracks-empty")).toBeVisible();
});

/**
 * Le cœur de la pierre 2, vu de l'utilisateur. Un rechargement est
 * exactement ce que subit un onglet que le navigateur a récupéré : le
 * tampon est en base, la mémoire a disparu.
 */
test("une sortie interrompue est retrouvée au rechargement, en pause", async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByTestId("sortie-demarrer").click();
  await marcher(page, 4);
  // `toHaveText` et non `toContainText` : « 160 m » **contient** « 0 m ».
  // L'assertion d'origine passait pour la mauvaise raison, et ne s'est vue
  // que le jour où la distance s'est mise à s'afficher en mètres.
  await expect(page.getByTestId("sortie-distance")).not.toHaveText("0 m");
  const distanceAvant = await page.getByTestId("sortie-distance").textContent();

  // On attend que les quatre points soient **sur le disque** : les chiffres
  // à l'écran bougent dès la mémoire, l'écriture suit dans sa file. Ce
  // test-ci porte sur la reprise, pas sur la latence d'écriture — et il
  // prouve du même coup que les points y arrivent vraiment.
  await expect.poll(() => pointsEnBase(page), { timeout: 10_000 }).toBe(4);

  await page.reload();
  await fermerLeGuide(page);

  await expect(page.getByTestId("sortie-reprise")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("sortie-reprendre")).toBeVisible();
  expect(await page.getByTestId("sortie-distance").textContent()).toBe(
    distanceAvant,
  );

  // Elle se reprend, et ce qui suit s'ajoute à ce qui précède.
  await page.getByTestId("sortie-reprendre").click();
  await expect(page.getByTestId("sortie-pause")).toBeVisible();
  await expect(page.getByTestId("sortie-reprise")).toHaveCount(0);
  await marcher(page, 8, 5);
  await expect(page.getByTestId("sortie-distance")).not.toHaveText(
    distanceAvant ?? "",
  );
});

/**
 * **Un seul suivi de position pour deux usages.** La carte montre où l'on
 * est, l'enregistrement retient par où l'on est passé ; deux
 * `watchPosition` simultanés demanderaient deux fois la position haute
 * précision au système, et sur quatre heures c'est la batterie qui paie.
 *
 * Le corollaire compte autant : arrêter l'affichage de sa position ne doit
 * pas arrêter l'enregistrement.
 */
test("la carte et l’enregistrement se partagent un seul suivi GPS", async ({
  page,
}) => {
  await ouvrir(page);
  expect(await suivisDePosition(page)).toBe(0);

  await page.getByTestId("locate-toggle").click();
  expect(await suivisDePosition(page)).toBe(1);

  await page.getByTestId("sortie-demarrer").click();
  expect(await suivisDePosition(page)).toBe(1);

  // On range la position de la carte ; la sortie continue.
  await page.getByTestId("locate-toggle").click();
  expect(await suivisDePosition(page)).toBe(1);
  await marcher(page, 3);
  // `toHaveText` et non `toContainText` : « 160 m » **contient** « 0 m ».
  // L'assertion d'origine passait pour la mauvaise raison, et ne s'est vue
  // que le jour où la distance s'est mise à s'afficher en mètres.
  await expect(page.getByTestId("sortie-distance")).not.toHaveText("0 m");

  // Et c'est la fin de la sortie qui referme le suivi.
  await page.getByTestId("sortie-terminer").click();
  await expect.poll(() => suivisDePosition(page), { timeout: 10_000 }).toBe(0);
});

/**
 * **Le parcours d'un téléphone**, celui pour lequel l'enregistrement
 * existe. Les quatre tests ci-dessus tournent à la largeur par défaut de
 * Playwright, où toutes les sections s'affichent en même temps ; sur un
 * téléphone, les onglets filtrent, et l'écran de marche vit sous
 * « Sorties ». La revue a trouvé le trou en essayant de cliquer
 * « Démarrer » à 390 px : le bouton n'était pas là.
 */
test.describe("sur un téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la sortie se démarre, se voit sur la carte, et se dit sur la barre", async ({
    page,
  }) => {
    await ouvrir(page);

    // Rien ne tourne : aucun témoin.
    await expect(page.getByTestId("temoin-sortie")).toHaveCount(0);

    await page.getByTestId("onglet-sorties").click();
    await page.getByTestId("sortie-demarrer").click();

    // Le témoin apparaît avant la première position : la sortie a commencé.
    await expect(page.getByTestId("temoin-sortie")).toHaveAttribute(
      "data-etat",
      "enregistrement",
    );

    await marcher(page, 5);
    // `toHaveText` et non `toContainText` : « 160 m » **contient** « 0 m ».
    // L'assertion d'origine passait pour la mauvaise raison, et ne s'est
    // vue que le jour où la distance s'est mise à s'afficher en mètres.
    await expect(page.getByTestId("sortie-distance")).not.toHaveText("0 m");

    // On retourne à la carte : le témoin reste, c'est tout son objet.
    await page.getByTestId("onglet-carte").click();
    await expect(page.getByTestId("temoin-sortie")).toBeVisible();

    // Et la sortie se dessine pendant qu'on la marche : sans cela on
    // regarde une carte vide pendant deux heures.
    await expect
      .poll(() => tracesSurLaCarte(page), { timeout: 15_000 })
      .toBe(1);

    // La pause change le témoin sans le faire disparaître : c'est la sortie
    // en pause qu'on oublie, pas celle qui tourne.
    await page.getByTestId("onglet-sorties").click();
    await page.getByTestId("sortie-pause").click();
    await expect(page.getByTestId("temoin-sortie")).toHaveAttribute(
      "data-etat",
      "pause",
    );
    // Le tracé reste : ce qui est marché l'a bien été.
    expect(await tracesSurLaCarte(page)).toBe(1);

    // Terminée, la sortie devient une trace : toujours une ligne, plus de
    // témoin. Une sortie dessinée deux fois serait une sortie fausse.
    await page.getByTestId("sortie-terminer").click();
    await expect(page.getByTestId("temoin-sortie")).toHaveCount(0);
    await expect
      .poll(() => tracesSurLaCarte(page), { timeout: 15_000 })
      .toBe(1);
  });
});

/**
 * La poignée de la feuille est la seule ligne toujours visible au-dessus de
 * la barre d'onglets quand on regarde la carte. Pendant une sortie, c'est
 * là que doit se lire la distance — sans déplier la feuille, sans changer
 * d'onglet. La feuille de route le demande en toutes lettres : « rien qui
 * demande de sortir le téléphone toutes les deux minutes ».
 */
test.describe("la poignée pendant une sortie", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la poignée annonce la sortie, puis ses chiffres", async ({ page }) => {
    await ouvrir(page);
    const poignee = page.getByTestId("sheet-handle-texte");
    await expect(poignee).toHaveText("Zones, traces et réglages");

    await page.getByTestId("onglet-sorties").click();
    await page.getByTestId("sortie-demarrer").click();

    // Avant la première position, elle dit ce qui est vrai — et pas un zéro.
    await expect(poignee).toHaveText("Sortie en cours");

    await marcher(page, 5);
    await expect(poignee).toContainText(/\d/);
    await expect(poignee).not.toHaveText("Sortie en cours");
    await expect(poignee).not.toHaveText("Zones, traces et réglages");

    // Et elle rend la place une fois la sortie rangée.
    await page.getByTestId("sortie-terminer").click();
    await expect(poignee).not.toHaveText("Sortie en cours");
    await expect
      .poll(() => poignee.textContent(), { timeout: 15_000 })
      .toMatch(/parcourus|Zones, traces et réglages/);
  });
});
