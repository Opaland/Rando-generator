/**
 * La seule porte par laquelle une adresse venue d'ailleurs devient un `href`.
 *
 * ## Le raté, daté du 25/08
 *
 * La règle « seul `http(s)://` devient un lien » existait déjà — deux fois,
 * recopiée à la main : dans `boucles.ts` pour les données ouvertes de la
 * Métropole, dans `poi.ts` pour les sites de refuges, et nulle part pour
 * l'import de sauvegarde.
 *
 * Ce dernier trou n'était pas un oubli d'attention, il était **structurel**.
 * Les deux gardes vivent au moment où l'on *lit le réseau*. L'import d'une
 * sauvegarde n'y repasse pas : `estItineraire` vérifie l'identifiant et les
 * coordonnées, jamais les détails. Une sauvegarde forgée portant
 * `lienWeb: "javascript:alert(document.cookie)"` traversait donc intacte, et
 * React 18 pose ce schéma tel quel dans le DOM — mesuré dans un navigateur,
 * pas supposé d'après la documentation.
 *
 * C'est mot pour mot la leçon du §6quater de CLAUDE.md, appliquée à autre
 * chose que `dist/` : **un contrôle placé avant l'action ne garde que ce que
 * l'action n'a pas encore changé.** Le parseur garde ce que le parseur a vu ;
 * il ne peut rien contre ce qu'un autre chemin écrira après lui.
 *
 * D'où cette fonction, et son emploi **au moment de poser le `href`** — là
 * où l'action se produit, et où il n'y a plus d'après. Les gardes de lecture
 * restent : elles refusent plus tôt et évitent de stocker une adresse qu'on
 * ne montrera jamais. Les deux couvrent deux instants différents ; ce n'est
 * pas un doublon.
 *
 * L'enjeu n'est pas théorique. Sentiers est entièrement local et garde des
 * traces personnelles en IndexedDB : une exécution de script ici, c'est la
 * promesse centrale du produit qui tombe.
 */

/**
 * Ce que les navigateurs ignorent dans un `href`, et qu'une expression
 * régulière naïve prend pour du contenu.
 *
 * Espaces, tabulations, retours ligne et caractères de contrôle : `" java\u0009
 * script:…"` s'exécute chez eux et ne commence pas par « javascript » pour
 * une regex. On les retire avant d'examiner le schéma, pas par confort.
 */
// eslint-disable-next-line no-control-regex -- ce sont précisément eux qu'on retire
const IGNORES_PAR_LE_NAVIGATEUR = /[\u0000-\u0020\u007f]/g

/**
 * L'adresse si elle est sûre à poser dans un `href`, `null` sinon.
 *
 * `^` est la moitié du travail : sans l'ancre,
 * `javascript:alert(1)#https://x` passe. Une vague de mutation avait déjà
 * trouvé exactement cette faute ailleurs dans le dépôt — le même motif, la
 * même ancre manquante.
 */
export function lienSortant(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const propre = url.replace(IGNORES_PAR_LE_NAVIGATEUR, '')
  if (propre === '') return null
  return /^https?:\/\//i.test(propre) ? propre : null
}
