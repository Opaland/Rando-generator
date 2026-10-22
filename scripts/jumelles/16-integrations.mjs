import { echouer } from "./_socle.mjs";
import { ecarts, fichiersAttendus } from "../generer-integrations.mjs";

/*
  ===========================================================================
  Seizième paire : les agents et skills de `.claude/`, et leurs copies pour
  Copilot et Gemini (#590).
  ===========================================================================

  `.claude/` est la source unique ; `.github/agents/` et `.gemini/` en sont
  générés par `scripts/generer-integrations.mjs`. Un agent modifié sans
  relancer le générateur laisserait Copilot et Gemini sur l'ancienne
  version, sans que rien ne le dise : deux copies qui ne changent jamais
  ensemble, le §4ter exactement.

  Le générateur sait déjà dire ce qui manque, ce qui est périmé et ce qui
  n'a plus de source : cette famille le lui demande, et ne recopie rien de
  sa logique (§4).
*/
const problemes = ecarts();

if (problemes.length > 0) {
  echouer(
    `Intégrations Copilot / Gemini pas à jour :\n` +
      problemes.map((p) => `  - ${p}`).join("\n") +
      `\n\n  → relancer \`node scripts/generer-integrations.mjs\` après toute` +
      ` modification de .claude/agents/, .claude/skills/ ou .claude/settings.json.`,
  );
}

export const resume = `${String(Object.keys(fichiersAttendus()).length)} fichiers Copilot / Gemini, tous générés depuis .claude/ et à jour`;
