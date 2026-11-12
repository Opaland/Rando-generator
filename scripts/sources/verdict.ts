/*
  Le tri des réponses des sources publiques (issue #669), à part du réseau
  pour être testé sans lui (`tests/unit/sourcesReelles.test.ts`).

  Modèle : `sources.yml` du dépôt Netatmo (son #363). Une source
  **injoignable** ne dit rien de son format : elle est ignorée. Une source
  qui **répond autre chose** que ce que Sentiers sait lire est rouge.
*/

/** HTTP qui disent « pas maintenant », pas « plus jamais » : surcharge, panne. */
const PASSAGERS = new Set([408, 429, 500, 502, 503, 504]);

export type Etat = 'verte' | 'ignoree' | 'rouge'

export interface Reponse {
  /** Le message d'un `fetch` qui n'a pas abouti : réseau, délai, DNS. */
  erreur?: string
  statut?: number
  /** Ce que la vérification de forme a trouvé : des noms et des comptes. */
  problemes?: string[]
  /**
   * Une réponse 200 que la source dit elle-même avortée — Overpass surchargé
   * rend `elements: []` et un `remark`, pas un 503 (`estUnEchecDeserveur`).
   */
  passager?: string
}

export interface Resultat {
  nom: string
  etat: Etat
  motif: string
  mesure: string
}

export function verdictDe({ erreur, statut, problemes = [], passager }: Reponse): { etat: Etat; motif: string } {
  if (erreur !== undefined) return { etat: "ignoree", motif: `injoignable (${erreur})` };
  if (statut === undefined || PASSAGERS.has(statut)) {
    return { etat: "ignoree", motif: `HTTP ${String(statut)}` };
  }
  /*
    Un 403 ou un 404 n'est pas une panne : c'est l'API de datARA passée à
    403 le 22/10 (#20), qu'on n'a apprise que par hasard.
  */
  if (statut < 200 || statut >= 300) return { etat: "rouge", motif: `HTTP ${String(statut)}` };
  if (passager !== undefined) return { etat: "ignoree", motif: passager };
  if (problemes.length > 0) return { etat: "rouge", motif: problemes.join(" ; ") };
  return { etat: "verte", motif: "" };
}

/**
 * `vert` seulement si toutes ont répondu dans la forme attendue : une source
 * ignorée n'a rien prouvé, et l'issue ouverte pour elle ne se referme pas
 * sur un passage où elle n'a pas répondu.
 */
export function etatGlobal(resultats: readonly { etat: Etat }[]): 'rouge' | 'incomplet' | 'vert' {
  if (resultats.some((r) => r.etat === "rouge")) return "rouge";
  if (resultats.some((r) => r.etat === "ignoree")) return "incomplet";
  return "vert";
}

const LIBELLES: Record<Etat, string> = { verte: "verte", ignoree: "ignorée", rouge: "rouge" };

/**
 * Une cellule de tableau Markdown. Une barre venue d'une source casserait le
 * tableau ; un « @nom » notifierait un compte GitHub une fois le rapport
 * devenu issue — l'espace sans chasse l'en empêche sans rien changer à l'œil.
 */
const cellule = (texte: string): string =>
  texte
    // L'antislash d'abord : sinon « a\|b » devient « a\\|b », un antislash
    // échappé suivi d'une vraie barre, et le tableau gagne une colonne.
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("@", "@\u200b")
    .replaceAll(/[\r\n]/g, " ");

/**
 * Le rapport : des noms de sources, de champs, et des comptes — jamais un
 * extrait des données.
 */
export function rapport(resultats: readonly Resultat[], date: string): string {
  const lignes = resultats.map(
    (r) =>
      `| ${cellule(r.nom)} | ${LIBELLES[r.etat]} | ${cellule(r.motif)} | ${cellule(r.mesure)} |`,
  );
  return [
    `Sources publiques interrogées le ${date} (\`npm run sources\`, issue #669).`,
    "",
    "| Source | État | Motif | Mesure |",
    "|---|---|---|---|",
    ...lignes,
    "",
  ].join("\n");
}
