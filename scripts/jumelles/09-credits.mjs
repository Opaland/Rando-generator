import { readFileSync } from "node:fs";
import { echouer } from "./_socle.mjs";

/*
  ===========================================================================
  Huitième paire : le crédit des sources, dans le HTML servi tel quel.
  ===========================================================================

  `public/pourquoi.html` est une page statique, hors du bundle : elle ne peut
  importer ni `src/lib/attribution.ts` ni quoi que ce soit. Elle portait donc
  la phrase de crédit **recopiée**, et le 29/08 elle a divergé — l'application
  disait « Fond © IGN (Plan IGN, licence ouverte Etalab) », la page dehors
  disait encore « Fond de carte © IGN (Etalab 2.0) ».

  Aucun diff ne pouvait le montrer : `App.tsx` et `pourquoi.html` ne changent
  jamais ensemble, et chacun paraît complet quand on le lit seul. §4ter, à la
  lettre — et §3, qui dit que le README n'est pas la seule surface qu'une
  correction de texte oublie.

  Le partage étant impossible, c'est le remède 2 : **un contrôle qui asserte
  que les deux sont d'accord**. Il reconstruit la phrase depuis les morceaux
  de `attribution.ts` et exige de la retrouver dans la page.
*/
const CREDITS = "src/lib/attribution.ts";
const POURQUOI = "public/pourquoi.html";

const sourceCredits = readFileSync(CREDITS, "utf8");

/** Lit un `export const NOM: Credit = { … }` et en rend les champs. */
function creditNomme(nom) {
  const bloc = new RegExp(
    `export const ${nom}: Credit = \\{([\\s\\S]*?)\\n\\}`,
  ).exec(sourceCredits)?.[1];
  if (bloc === undefined) {
    echouer(
      `Le crédit « ${nom} » ne se lit plus dans ${CREDITS} : le motif` +
        ` « export const ${nom}: Credit = { … } » ne correspond plus, et ce` +
        ` contrôle ne garde donc plus rien.`,
    );
  }
  const champ = (cle) =>
    new RegExp(`\\b${cle}: '([^']*)'`).exec(bloc)?.[1] ?? null;
  return {
    quoi: champ("quoi"),
    devant: champ("devant") ?? "",
    qui: champ("qui"),
    licence: champ("licence"),
  };
}

const enTexte = (c) => `${c.quoi} © ${c.devant}${c.qui} (${c.licence})`;

const osm = creditNomme("OSM");
const ign = creditNomme("IGN");

for (const [nom, credit] of [
  ["OSM", osm],
  ["IGN", ign],
]) {
  if (credit.quoi === null || credit.qui === null || credit.licence === null) {
    echouer(
      `Le crédit « ${nom} » a perdu un de ses champs dans ${CREDITS}` +
        ` (quoi / qui / licence). La phrase reconstruite serait fausse, et ce` +
        ` contrôle comparerait n'importe quoi.`,
    );
  }
}

const marques = /MARQUES_FFRANDONNEE =\n\s*'([^']*)'/.exec(sourceCredits)?.[1];
if (marques === undefined) {
  echouer(
    `MARQUES_FFRANDONNEE ne se lit plus dans ${CREDITS} : ce contrôle ne` +
      ` garde donc plus la mention de marque.`,
  );
}

/*
  Reconstruite dans l'ordre qu'emploie le pied du panneau — OSM puis IGN,
  puis les marques. C'est la phrase que `App.tsx` compose ; celle du papier
  en ajoute la Métropole et ne se compare pas ici, `pourquoi.html` n'ayant
  pas de feuille à imprimer.
*/
const creditAttendu = `${enTexte(osm)} · ${enTexte(ign)} · ${marques}`;

/*
  Espacement normalisé : le HTML est replié à 80 colonnes, la phrase y est
  donc coupée par des retours à la ligne qui ne changent rien à ce qui
  s'affiche. Comparer à la lettre ferait échouer ce contrôle sur un
  reformatage, c'est-à-dire un contrôle qu'on finirait par désactiver.
*/
const aplati = (texte) => texte.replace(/\s+/g, " ").trim();
const sourcePourquoi = aplati(readFileSync(POURQUOI, "utf8"));

if (!sourcePourquoi.includes(aplati(creditAttendu))) {
  echouer(
    `${POURQUOI} ne porte pas le crédit que ${CREDITS} compose.\n` +
      `Attendu : ${creditAttendu}\n` +
      `  → la page publique est servie hors du bundle : elle ne peut pas` +
      ` importer les morceaux, donc elle les recopie, donc elle dérive.` +
      ` C'est la surface qu'une correction de texte oublie (§3).`,
  );
}

export const resume = `le crédit des sources, recopié dans ${POURQUOI} et d'accord avec ${CREDITS}`;
