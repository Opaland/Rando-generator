/**
 * Ce qu'une zone a de travers, dit en une phrase (issue #404).
 *
 * ## Le défaut, et pourquoi il ne se voyait pas
 *
 * Les trois diagnostics de zone vivaient dans `loadZone`, écrits à la suite
 * de l'analyse de la réponse Overpass — donc **après** le retour anticipé
 * qui sert une zone déjà en cache. Une zone tient trente jours : le message
 * était donc dit au premier chargement, et tu par toutes les visites
 * suivantes. Ce sont précisément celles où l'on vient regarder ses
 * pourcentages, et le plus grave des trois diagnostics dit justement que ces
 * pourcentages sont faux.
 *
 * Recopier les trois conditions sur le chemin du cache aurait été le défaut
 * du §4, dont ce dépôt garde quatre exemplaires datés. La condition devient
 * donc une fonction nommée, consultée par les deux chemins.
 *
 * ## Ce qui est stocké, et ce qui ne l'est pas
 *
 * Le cache garde les **faits** (`partielle`, `perdues`), pas la phrase. Deux
 * raisons : une phrase mise en cache vieillit sans qu'on le sache — c'est le
 * §4bis — et deux rédactions de la même règle finissent par diverger, ce que
 * le §4ter mesure ailleurs à trois exemplaires.
 */

/** Ce qu'on sait d'une zone au moment de l'afficher. */
interface FaitsDeZone {
  /** Combien d'itinéraires sont à l'écran. */
  itineraires: number
  /**
   * Overpass a-t-il interrompu la requête en cours de route ?
   *
   * Absent sur une zone mise en cache avant #404 : l'absence veut dire « on
   * ne sait pas », et on se tait alors — exactement ce que faisait
   * l'application pour toutes les zones jusqu'ici.
   */
  partielle?: boolean | undefined
  /** Combien d'itinéraires découpés n'ont rendu aucun tronçon. */
  perdues?: number | undefined
}

/**
 * La phrase à afficher, ou `null` s'il n'y a rien à signaler.
 *
 * L'ordre des trois est délibéré et se décide (§2) : d'abord ce qui se voit
 * — une zone vide —, ensuite ce qui fausse le chiffre central — une zone
 * tronquée —, enfin ce qui ne se voit pas du tout.
 */
export function messageDeZone(faits: FaitsDeZone): string | null {
  if (faits.itineraires === 0) {
    return 'Aucun itinéraire balisé trouvé dans cette zone sur OpenStreetMap. Réessayez avec « Actualiser les tracés », ou choisissez une autre zone.'
  }
  if (faits.partielle === true) {
    // Overpass a rendu des données **et** un motif : il a interrompu la
    // requête. Ce qui est à l'écran est un morceau de la zone, et rien ne le
    // distingue d'une zone complète — sauf de le dire. Une complétion
    // calculée là-dessus est fausse par excès.
    return 'Les serveurs OpenStreetMap ont interrompu la requête : cette zone n’est affichée qu’en partie. Vos pourcentages sont donc surestimés. Essayez un secteur plus petit pour l’avoir en entier.'
  }
  const perdues = faits.perdues ?? 0
  if (perdues > 0) {
    const pluriel = perdues > 1
    return `${String(perdues)} itinéraire${pluriel ? 's' : ''} de cette zone ${pluriel ? 'sont découpés' : 'est découpé'} en tronçons qu’OpenStreetMap n’a pas rendus : ${pluriel ? 'ils ne sont donc pas affichés' : 'il n’est donc pas affiché'}. Le reste de la zone est complet.`
  }
  return null
}

/**
 * Le message quand les miroirs Overpass sont injoignables et qu'on retombe
 * sur une zone déjà en cache, même périmée (#404, troisième chemin — sorti
 * de `trancheZone.ts` au sprint 8 d'octobre, issue #539).
 *
 * « Réessayez avec “Actualiser les tracés” » — le conseil de la zone vide —
 * est délibérément écarté ici : c'est exactement le geste qui vient
 * d'échouer, et le proposer enverrait quelqu'un refaire ce qui ne marchera
 * pas. Une zone vide se voit à l'écran ; elle n'a pas besoin d'une marche à
 * suivre qui ne marchera pas. C'est pour ce seul mot que cette fonction
 * n'appelle pas simplement `messageDeZone` tel quel.
 */
export function messageDeRepliSurCache(faits: FaitsDeZone): string {
  const diagnostic = faits.itineraires === 0 ? null : messageDeZone(faits)
  return (
    'Serveurs OpenStreetMap injoignables : affichage des tracés en cache (ils datent peut-être un peu).' +
    (diagnostic === null ? '' : ` ${diagnostic}`)
  )
}

/**
 * Le message de la zone restaurée au démarrage (#550, quatrième chemin).
 *
 * Elle se montre même trop vieille ou d'un schéma ancien : aucune requête
 * ne part au démarrage sans un geste, et une copie qu'on dit vieille vaut
 * mieux qu'un écran vide hors réseau. C'est un choix de présentation (§2),
 * pas un seuil : l'âge et le schéma sont jugés par `zoneUtilisable`
 * (`db/database.ts`), la même garde que le chemin normal, et l'appelant en
 * passe le verdict dans `aJour`.
 */
export function messageDeRestauration(
  faits: FaitsDeZone & { aJour: boolean },
): string | null {
  const diagnostic = messageDeZone(faits)
  if (faits.aJour) return diagnostic
  return (
    'Ces tracés viennent d’une copie ancienne, ou enregistrée par une version précédente de Sentiers : certaines informations peuvent manquer ou avoir changé. « Actualiser les tracés » la met à jour.' +
    (diagnostic === null ? '' : ` ${diagnostic}`)
  )
}
