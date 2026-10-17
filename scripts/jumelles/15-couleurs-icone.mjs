import { lire, echouer } from "./_socle.mjs";

/*
  ===========================================================================
  Quinzième paire : le dessin de l'icône, dans le SVG et dans le générateur
  de PNG.
  ===========================================================================

  `public/icon.svg` est le dessin de référence. `scripts/generate-icons.py`
  le reproduit en pur Python (zlib + CRC32 de la bibliothèque standard, sans
  bibliothèque d'image) pour produire les PNG commités, et porte lui-même le
  commentaire « Mêmes couleurs et proportions que public/icon.svg ».

  Le §4bis le dit : un commentaire qui affirme une concordance est une
  assertion, pas une preuve — elle vieillit comme le reste, et personne ne la
  relit parce qu'elle a l'air d'expliquer. Ce contrôle vérifie que cette
  phrase est encore vraie : les trois couleurs et les trois bandes du SVG
  sont retrouvées, telles quelles, dans le générateur.
*/
const SVG = "public/icon.svg";
const GENERATEUR = "scripts/generate-icons.py";

const svg = lire(SVG);
const rects = [...svg.matchAll(/<rect\s+([^/]+?)\/>/g)].map((m) => {
  const attrs = {};
  for (const [, cle, valeur] of m[1].matchAll(/([a-z]+)="([^"]+)"/g)) {
    attrs[cle] = valeur;
  }
  return attrs;
});
if (rects.length !== 3) {
  echouer(
    `${SVG} : ${String(rects.length)} rectangle(s) lu(s), 3 attendus (fond,` +
      ` bande blanche, bande rouge). Le dessin a changé de forme, ce` +
      ` contrôle ne sait plus le lire — le réparer plutôt que le retirer.`,
  );
}

/*
  Les bandes se distinguent par leur position, pas par leur couleur
  attendue : chercher un rectangle par sa couleur attendue rendrait ce
  contrôle aveugle à la couleur qui a changé — mesuré en l'éprouvant avec
  une couleur altérée, qui rendait « introuvable » au lieu du désaccord
  qu'on cherche justement à voir.
*/
const fond = rects.find((r) => !("x" in r));
const bandes = rects
  .filter((r) => "x" in r)
  .sort((a, b) => Number(a.y) - Number(b.y));
if (!fond || bandes.length !== 2) {
  echouer(
    `${SVG} : fond ou bandes introuvables parmi les rectangles lus. Le` +
      ` motif de lecture ne correspond plus, ce contrôle ne garde donc` +
      ` plus rien.`,
  );
}
const [blanche, rouge] = bandes;

const source = lire(GENERATEUR);
function triplet(nom) {
  const motif = new RegExp(
    `${nom} = \\(0x([0-9A-Fa-f]{2}), 0x([0-9A-Fa-f]{2}), 0x([0-9A-Fa-f]{2})\\)`,
  );
  const trouve = motif.exec(source);
  return trouve ? trouve.slice(1, 4).map((h) => parseInt(h, 16)) : null;
}
function paire(nom) {
  const motif = new RegExp(`${nom} = \\((\\d+), (\\d+)\\)`);
  const trouve = motif.exec(source);
  return trouve ? [Number(trouve[1]), Number(trouve[2])] : null;
}

const pyFond = triplet("FOND");
const pyBlanc = triplet("BLANC");
const pyRouge = triplet("ROUGE");
const pyBandeX = paire("BANDE_X");
const pyBandeBlanche = paire("BANDE_BLANCHE_Y");
const pyBandeRouge = paire("BANDE_ROUGE_Y");
if (
  !pyFond ||
  !pyBlanc ||
  !pyRouge ||
  !pyBandeX ||
  !pyBandeBlanche ||
  !pyBandeRouge
) {
  echouer(
    `${GENERATEUR} : FOND, BLANC, ROUGE, BANDE_X, BANDE_BLANCHE_Y ou` +
      ` BANDE_ROUGE_Y introuvable sous la forme attendue. Le motif de` +
      ` lecture ne correspond plus, ce contrôle ne garde donc plus rien.`,
  );
}

function hexVersTriplet(hex) {
  const corps = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(corps.slice(i, i + 2), 16));
}

const desaccords = [];

if (hexVersTriplet(fond.fill).join(",") !== pyFond.join(",")) {
  desaccords.push(
    `fond : ${fond.fill} (SVG) contre FOND = ${pyFond.join(", ")} (${GENERATEUR})`,
  );
}
if (hexVersTriplet(blanche.fill).join(",") !== pyBlanc.join(",")) {
  desaccords.push(
    `bande blanche : ${blanche.fill} (SVG) contre BLANC = ${pyBlanc.join(", ")} (${GENERATEUR})`,
  );
}
if (hexVersTriplet(rouge.fill).join(",") !== pyRouge.join(",")) {
  desaccords.push(
    `bande rouge : ${rouge.fill} (SVG) contre ROUGE = ${pyRouge.join(", ")} (${GENERATEUR})`,
  );
}

function bornes(rect) {
  const x = Number(rect.x);
  const y = Number(rect.y);
  return {
    x: [x, x + Number(rect.width)],
    y: [y, y + Number(rect.height)],
  };
}
const bornesBlanche = bornes(blanche);
const bornesRouge = bornes(rouge);

if (bornesBlanche.x.join(",") !== pyBandeX.join(",")) {
  desaccords.push(
    `largeur de bande : ${bornesBlanche.x.join("-")} (SVG, blanche) contre` +
      ` BANDE_X = ${pyBandeX.join("-")} (${GENERATEUR})`,
  );
}
if (bornesRouge.x.join(",") !== pyBandeX.join(",")) {
  desaccords.push(
    `largeur de bande : ${bornesRouge.x.join("-")} (SVG, rouge) contre` +
      ` BANDE_X = ${pyBandeX.join("-")} (${GENERATEUR})`,
  );
}
if (bornesBlanche.y.join(",") !== pyBandeBlanche.join(",")) {
  desaccords.push(
    `bande blanche : hauteur ${bornesBlanche.y.join("-")} (SVG) contre` +
      ` BANDE_BLANCHE_Y = ${pyBandeBlanche.join("-")} (${GENERATEUR})`,
  );
}
if (bornesRouge.y.join(",") !== pyBandeRouge.join(",")) {
  desaccords.push(
    `bande rouge : hauteur ${bornesRouge.y.join("-")} (SVG) contre` +
      ` BANDE_ROUGE_Y = ${pyBandeRouge.join("-")} (${GENERATEUR})`,
  );
}

if (desaccords.length > 0) {
  echouer(
    `${GENERATEUR} ne dessine plus ce que ${SVG} dessine :\n` +
      desaccords.map((d) => `  - ${d}`).join("\n") +
      `\n\n  → son commentaire affirme pourtant « Mêmes couleurs et` +
      ` proportions que public/icon.svg » : ce n'est plus vrai (§4bis).`,
  );
}

export const resume = `icône (couleurs et bandes) d'accord entre ${SVG} et ${GENERATEUR}`;
