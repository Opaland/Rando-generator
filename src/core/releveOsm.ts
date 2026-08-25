/**
 * Quand cette information a-t-elle été relevée ? (issue #285)
 *
 * ## Pourquoi une date change tout
 *
 * `opening_hours` est ce qu'un contributeur a saisi **un jour**. Le lot
 * précédent a corrigé le mot — la fiche écrit « annoncé ouvert » et non
 * « ouvert » — mais « annoncé » ne dit toujours pas *quand*.
 *
 * En moyenne montagne, la fermeture saisonnière est la règle et
 * n'apparaît presque jamais dans le tag : une supérette qui annonce
 * `Mo-Sa 08:00-19:00` est fermée de novembre à mai, et OpenStreetMap ne le
 * sait pas. Un horaire relevé en 2019 et un horaire relevé le mois dernier
 * s'affichaient exactement pareil.
 *
 * La date ne rend pas l'horaire vrai. Elle rend le doute **proportionné** :
 * devant « annoncé ouvert Mo-Sa 08:00-19:00 — relevé le 12/03/2019 », on
 * téléphone avant de descendre. C'est tout ce qu'on peut honnêtement offrir,
 * et c'est ce que l'issue demande en propres termes : « la seule chose qui
 * permette de juger ».
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne calcule pas « ouvert maintenant ». `tests/unit/etatDeclare.test.ts`
 * l'interdit sur toutes les surfaces, et l'issue le redit : se fier à ce mot,
 * c'est arriver au village avec un sac vide.
 */

/**
 * « relevé le 12/03/2019 », ou `null` si la date manque ou ne se lit pas.
 *
 * `null` plutôt qu'une date de repli : une réponse en cache d'avant ce
 * changement n'a pas d'horodatage, et lui donner celle du jour ferait passer
 * un relevé de 2019 pour tout frais — l'inverse exact de ce que ce module
 * existe pour empêcher.
 */
export function dateDeReleve(
  horodatage: string | null | undefined,
): string | null {
  if (!horodatage) return null
  const instant = Date.parse(horodatage)
  if (!Number.isFinite(instant)) return null
  // L'heure d'une modification OSM ne dit rien à personne, et allonge une
  // ligne déjà chargée.
  return `relevé le ${new Date(instant).toLocaleDateString('fr-FR')}`
}

/**
 * Ce point déclare-t-il quelque chose qu'une date permettrait de juger ?
 *
 * La question se pose parce que la date n'a de sens qu'à côté d'une
 * déclaration. « 250 m de détour — relevé le 12/03/2019 » n'apprend rien à
 * personne, et si la date s'affichait partout elle deviendrait le bruit qui
 * empêche de la voir là où elle sert.
 *
 * Une fonction nommée plutôt qu'une condition recopiée dans la fiche : la
 * même question se posera à la carte et à l'export (CLAUDE.md §4).
 */
export function declareQuelqueChose(details: {
  openingHours: string | null
  phone: string | null
  website: string | null
  capacity: string | null
  operator: string | null
}): boolean {
  return (
    details.openingHours !== null ||
    details.phone !== null ||
    details.website !== null ||
    details.capacity !== null ||
    details.operator !== null
  )
}
