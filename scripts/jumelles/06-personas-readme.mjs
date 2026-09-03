import { readFileSync } from "node:fs";
import { PERSONAS, LISEZ_MOI, compteAnnonce, echouer } from "./_socle.mjs";

/*
  Le README annonce un nombre de personas, `docs/PERSONAS.md` en tient un
  autre.

  Il disait « Six personnes suivies pas à pas » quand le document en portait
  **dix**, et dix-neuf après la passe du 28/08. Personne ne pouvait le voir :
  le README et ce document ne changent jamais dans le même diff, et chacun
  paraît complet quand on le lit seul.

  On compte les **personnes**, pas les titres. Le document revient sur Sylvie
  et sur Bernard dans une seconde passe, sous un titre qui porte leur prénom :
  compter les titres rendait vingt là où il y a dix-huit personnes. C'est le
  piège que la skill de revue globale nomme — vérifier à la main le premier
  résultat de tout script de revue — et il s'est refermé au premier essai.
*/

const fichesDePersonas = new Set(
  [
    ...readFileSync(PERSONAS, "utf8").matchAll(
      /^#{2,3} ([A-ZÉÈÀÎÔ][\p{L}-]*), /gmu,
    ),
  ].map((m) => m[1]),
).size;
if (fichesDePersonas === 0) {
  echouer(
    `Aucune fiche de persona lue dans ${PERSONAS} : le motif de lecture ne` +
      ` correspond plus, et ce contrôle ne garde donc plus rien.`,
  );
}

const ligneDuTableau = /^.*personnes suivies pas à pas.*$/m.exec(
  readFileSync(LISEZ_MOI, "utf8"),
);
if (!ligneDuTableau) {
  echouer(
    `« personnes suivies pas à pas » est introuvable dans ${LISEZ_MOI} :` +
      ` l'ancre ne correspond plus, et ce contrôle ne garde donc plus rien.`,
  );
}
const annoncePersonas = compteAnnonce(ligneDuTableau[0], "personnes");
if (annoncePersonas !== fichesDePersonas) {
  echouer(
    `${LISEZ_MOI} annonce ${annoncePersonas === -1 ? "un compte illisible" : String(annoncePersonas)}` +
      ` personne(s) suivie(s) pas à pas, ${PERSONAS} en tient` +
      ` ${String(fichesDePersonas)}.\n` +
      `\nLigne lue : « ${ligneDuTableau[0].trim()} »`,
  );
}

export const resume = `${String(fichesDePersonas)} fiches de personas, annoncées telles quelles`;
