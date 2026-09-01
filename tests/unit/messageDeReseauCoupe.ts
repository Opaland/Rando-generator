/**
 * Le message de la coupure réseau, seul et sans effet de bord (#456).
 *
 * ## Pourquoi ce fichier existe, et il n'a rien d'un détail
 *
 * Ma première version gardait cette constante dans `reseauCoupe.ts`, avec la
 * coupure. Le test qui vérifie que la coupure est branchée l'importait de
 * là — **et cet import installe la coupure**. Le test passait donc que
 * `setupFiles` soit configuré ou non : retirer la ligne de `vite.config.ts`
 * ne le faisait pas rougir.
 *
 * Une garde qui ne peut pas échouer ne garde rien (§1), et le §1bis nomme la
 * forme : une assertion qui pourrait passer pour une raison qu'on n'a pas
 * voulue n'est pas une assertion. Trouvé en retirant la ligne exprès, pas en
 * relisant.
 *
 * Le message vit donc ici, où l'importer ne fait rien arriver. Les deux
 * autres fichiers le lisent : celui qui coupe, et celui qui vérifie que la
 * coupure est en place.
 */
export const RESEAU_COUPE =
  'Réseau coupé dans la suite unitaire : ce test appelle fetch. Bouchonnez ' +
  'la source (vi.mock du module, ou vi.stubGlobal sur fetch) plutôt que de ' +
  'dépendre du réseau de la machine — voir tests/unit/reseauCoupe.ts.'
