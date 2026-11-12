#!/usr/bin/env node
/*
  La porte, en une commande (issue #667).

    npm run porte             tout : les étapes de la CI, puis `monkey`
    npm run porte -- --rapide ce qui précède le build (lint … ports)
    npm run porte -- --liste  les étapes, sans rien lancer

  Le §6 de CLAUDE.md demande « la porte complète avant de committer », et le
  dépôt n'avait aucune commande qui la lance : chaque session la retapait,
  et la routine PDIPR (docs/routine-pdipr/ROUTINE.md) la réécrivait chaque
  soir dans un script de brouillon qui ne survit pas à une session neuve.

  Les étapes ne sont **pas** écrites ici : elles sont lues dans
  `.github/workflows/ci.yml` par `commandesDeLaPorte`, la fonction que
  `npm run listes` emploie déjà pour tenir d'accord le §6, la skill et le
  README (CLAUDE.md §4ter). Modèle : `scripts/porte.mjs` du dépôt Netatmo.

  Ce que la commande règle d'elle-même, parce qu'un garde-fou qu'il faut
  penser à taper ne garde rien (§6quater) :
  - chaque étape est un processus à part, dans l'ordre : `build` et `e2e`
    ne partagent jamais une commande, ce que le crochet refuserait ;
  - dans le conteneur cloud, `PW_CHROMIUM_PATH` est posé s'il manque et que
    `/opt/pw-browsers/chromium` existe ; ailleurs, rien n'est touché ;
  - la première étape rouge arrête tout, nommée, avec la fin de sa sortie.

  Ce qu'elle ne fait pas : installer (`npm ci`), ni reconstruire pendant
  qu'elle tourne. L'arbre ne bouge pas tant qu'elle tourne (§6quater).
*/
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { commandesDeLaPorte } from "./jumelles/_socle.mjs";

const CHROMIUM_DU_CONTENEUR = "/opt/pw-browsers/chromium";
const LIGNES_EN_CAS_D_ECHEC = 40;

const etapes = commandesDeLaPorte();
const rapide = process.argv.includes("--rapide");
const aLancer = rapide ? etapes.slice(0, etapes.indexOf("build")) : etapes;

if (process.argv.includes("--liste")) {
  console.log(aLancer.join("\n"));
  process.exit(0);
}

const env = { ...process.env };
if (!env.PW_CHROMIUM_PATH && existsSync(CHROMIUM_DU_CONTENEUR)) {
  env.PW_CHROMIUM_PATH = CHROMIUM_DU_CONTENEUR;
}

for (const etape of aLancer) {
  const debut = Date.now();
  const r = spawnSync("npm", ["run", etape], { env, encoding: "utf8", maxBuffer: 1 << 28 });
  const secondes = Math.round((Date.now() - debut) / 1000);
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) {
    console.log(`ROUGE : ${etape} (${String(secondes)} s)\n`);
    console.log(sortie.trimEnd().split("\n").slice(-LIGNES_EN_CAS_D_ECHEC).join("\n"));
    process.exit(1);
  }
  const resume = sortie
    .split("\n")
    .filter((l) => /passed|Tests |built|d’accord|d'accord|annoncées|cités|Ports/.test(l))
    .slice(-1)[0]
    ?.trim();
  console.log(`vert : ${etape} (${String(secondes)} s)${resume ? ` — ${resume.slice(0, 120)}` : ""}`);
}
console.log(rapide ? "PORTE RAPIDE VERTE" : "PORTE VERTE");
