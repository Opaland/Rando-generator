/**
 * Ce que le précache peut laisser de côté sans casser le hors-ligne (#673).
 *
 * Le SDK d'Anthropic pèse ~80 Ko compressés et ne sert qu'à qui a collé sa
 * clé et demande un texte — ce qui suppose le réseau. Le précacher le ferait
 * télécharger en arrière-plan par chaque visiteur ; il en est donc écarté.
 *
 * **Le piège, mesuré le 12/11 par la CI** : un premier essai nommait ce bloc
 * par `manualChunks`, et Rollup y a rangé un utilitaire partagé que la page
 * importait **statiquement**. Hors précache, l'application ne démarrait plus
 * hors connexion — et la porte locale ne l'avait pas vu. D'où la garde : un
 * bloc écarté ne doit être atteignable depuis la page que par un `import()`
 * dynamique. Sinon la construction échoue, là où l'action se produit
 * (CLAUDE.md §6quater).
 */

/** Une chaîne que seul le SDK d'Anthropic contient : l'en-tête de son mode navigateur. */
const MARQUE_DU_SDK = 'anthropic-dangerous-direct-browser-access'

/** Le bloc contient-il le SDK d'Anthropic ? */
export function estLeSdkClaude(contenu: string): boolean {
  return contenu.includes(MARQUE_DU_SDK)
}

/** Les blocs qu'un module importe **statiquement** (`import … from "./x.js"`, `import "./x.js"`). */
export function importsStatiques(contenu: string): string[] {
  const noms = new Set<string>()
  for (const m of contenu.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([\w.-]+\.js)["']/g)) {
    noms.add(m[1])
  }
  return [...noms]
}

/**
 * Les blocs atteints statiquement depuis `entrees`, elles comprises.
 * `lire` rend le contenu d'un bloc par son nom, ou `null` s'il n'existe pas.
 */
export function atteintsStatiquement(
  entrees: readonly string[],
  lire: (nom: string) => string | null,
): Set<string> {
  const vus = new Set<string>()
  const pile = [...entrees]
  while (pile.length > 0) {
    const nom = pile.pop() as string
    if (vus.has(nom)) continue
    const contenu = lire(nom)
    if (contenu === null) continue
    vus.add(nom)
    pile.push(...importsStatiques(contenu))
  }
  return vus
}
