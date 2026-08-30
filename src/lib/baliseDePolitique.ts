/**
 * Poser la politique de sécurité dans une page, sans jamais l'empiler (#420).
 *
 * ## Le raté, daté du 30/08
 *
 * Le greffon `sentiers-csp-balise` **ajoutait** la balise sans regarder si
 * elle était déjà là. Le fichier qu'il lit vient d'être copié depuis
 * `public/`, donc en temps normal il n'en porte aucune : l'opération était
 * idempotente **par accident**, parce que Vite vide `dist/` à chaque
 * construction, et non par construction.
 *
 * Deux constructions qui se chevauchent suffisent à le montrer :
 * `dist/pourquoi.html` a porté **trois** balises identiques, et le test de
 * bout en bout a rougi parce que son sélecteur résolvait trois éléments.
 *
 * Trois copies d'une même politique n'ont rien cassé — un navigateur applique
 * l'intersection, et l'intersection de trois copies d'une règle est cette
 * règle. Ce qui était cassé, c'est la garantie : le jour où les deux
 * constructions portent des politiques **différentes**, la page servirait la
 * plus stricte des deux sans que rien ne le dise. Une politique trop stricte
 * rend la carte grise.
 *
 * ## Pourquoi cette fonction vit ici
 *
 * Elle est pure — une chaîne entre, une chaîne sort — et c'est ce qui la rend
 * éprouvable. `vite.config.ts` garde ce qui ne l'est pas : la lecture de
 * `deploy/csp.conf` et la composition de la balise.
 *
 * Rien dans l'application ne l'importe : elle ne part donc pas dans le
 * paquet livré.
 */

/** Le point d'ancrage : première balise de chaque `<head>` du dépôt. */
export const APRES_LA_BALISE = '<meta charset="UTF-8" />'

/**
 * Toute balise de politique déjà présente, avec l'espace qui la précède.
 *
 * Le motif s'arrête au premier `>` : une valeur de politique ne contient
 * jamais ce caractère — elle est faite de schémas, d'hôtes et de mots-clefs
 * entre apostrophes — et l'accepter rendrait le motif capable d'avaler la
 * suite du `<head>`.
 */
const BALISE_EXISTANTE =
  /[ \t]*<meta\s+http-equiv="Content-Security-Policy"[^>]*>\n?/g

/**
 * Rend `html` avec exactement **une** balise de politique, celle donnée.
 *
 * Deux applications de suite rendent la même chaîne qu'une seule : c'est la
 * propriété qui manquait, et c'est celle que `tests/unit/baliseDePolitique.test.ts`
 * garde.
 */
export function poserLaPolitique(
  html: string,
  balise: string,
  quoi: string,
): string {
  if (!html.includes(APRES_LA_BALISE)) {
    throw new Error(
      `sentiers-csp-balise : « ${APRES_LA_BALISE} » introuvable dans ${quoi}.` +
        ' La page serait servie sans politique de sécurité, et rien ne le' +
        ' dirait.',
    )
  }
  const sansAncienne = html.replace(BALISE_EXISTANTE, '')
  return sansAncienne.replace(
    APRES_LA_BALISE,
    `${APRES_LA_BALISE}\n    ${balise}`,
  )
}
