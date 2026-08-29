/**
 * Les crédits que Sentiers doit à ses sources, nommés une fois.
 *
 * ## Pourquoi ce fichier existe
 *
 * La même phrase était écrite à quatre endroits — `map/style.ts` deux fois
 * (en HTML, pour MapLibre), `summaryCard.ts` sur la carte de partage,
 * `App.tsx` au pied du panneau — et les quatre **ne disaient pas la même
 * chose** : « Fond © IGN (Plan IGN, licence ouverte Etalab) » d'un côté,
 * « Fond de carte © IGN (Etalab 2.0) » de l'autre ; la Métropole citée par
 * la carte et absente de l'image de partage.
 *
 * C'est la forme exacte du §4ter : deux listes qui disent la même règle ont
 * le même trou. Ici le trou s'est ouvert à l'impression — `@media print`
 * masque la carte et le pied du panneau, donc les deux seuls porteurs, et la
 * feuille partait sans aucun crédit (issue #386). Aucun diff ne pouvait le
 * montrer : les fichiers ne changent jamais ensemble.
 *
 * ## Ce que ce fichier ne fait pas
 *
 * Il ne fusionne pas les quatre phrases en une. Chaque surface a ses raisons
 * — l'image de partage n'affiche aucun fond de carte, le pied du panneau
 * porte en plus les marques de la FFRandonnée — et décider d'une formule
 * unique est une décision de rédaction, pas une mesure (§2).
 *
 * Ce qu'il retire, c'est la **recopie** : les morceaux sont ici, chaque
 * surface compose ceux qu'elle emploie, et aucune ne réécrit un nom de
 * licence à la main.
 */

import type { GpxAttribution } from '../core/gpxExport.ts'

/** Un crédit : à qui, pour quoi, sous quelle licence, et où lire celle-ci. */
export interface Credit {
  /** Ce qu'on doit à cette source, tel qu'il apparaît dans la phrase. */
  readonly quoi: string
  /**
   * Ce qui précède le nom **hors du lien**, séparateur compris.
   *
   * OpenStreetMap se crédite « les contributeurs OpenStreetMap », et seul le
   * dernier mot est cliquable : le lien mène à la page de droits, pas aux
   * contributeurs. Le champ existe pour que la forme HTML reste celle que la
   * carte affiche déjà, au caractère près.
   */
  readonly devant?: string
  /** Le nom du producteur, seul mot que le lien habille. */
  readonly qui: string
  /**
   * La licence, entre parenthèses — absente quand on ne la connaît pas.
   *
   * Une source déclarée par un fichier importé porte une **adresse** de
   * licence, pas son nom court : le PDIPR de Léa dit
   * `etalab.gouv.fr/licence-ouverte-open-licence` et non « Licence Ouverte »
   * (issue #87). Écrire l'adresse entre parenthèses serait illisible, et
   * inventer le nom court serait inventer un fait — le §2 interdit les deux.
   * On crédite alors sans nommer la licence.
   */
  readonly licence?: string
  /** Où la licence se lit — l'ODbL l'exige, les autres s'en accommodent. */
  readonly lien: string
}

/**
 * Les itinéraires, et le fond quand il vient d'OSM.
 *
 * `lien` pointe la page de droits d'auteur d'OpenStreetMap et non l'ODbL
 * elle-même : c'est ce que la fondation demande, et c'est cette page qui
 * explique ce que la licence implique pour une production dérivée.
 */
export const OSM: Credit = {
  quoi: 'Itinéraires',
  devant: 'les contributeurs ',
  qui: 'OpenStreetMap',
  licence: 'ODbL',
  lien: 'https://www.openstreetmap.org/copyright',
}

/**
 * Le fond de carte par défaut.
 *
 * **« 2.0 » n'est pas décoratif.** La Licence Ouverte a deux versions, et la
 * seconde n'a pas les mêmes clauses que la première : nommer la licence sans
 * sa version, c'est nommer deux licences à la fois.
 *
 * Retrouvé à la revue du 29/08, et c'était mon erreur : avant elle, la
 * version était écrite quatre fois — `About.tsx`, trois passages du README —
 * et omise une seule, dans la chaîne de la carte. En composant les crédits
 * (#386) j'ai unifié sur **l'omission**, et je l'ai propagée au pied du
 * panneau et à `pourquoi.html`. La divergence a donc grandi pendant que je
 * croyais la supprimer.
 */
export const IGN: Credit = {
  quoi: 'Fond',
  qui: 'IGN',
  licence: 'Plan IGN, licence ouverte Etalab 2.0',
  lien: 'https://www.ign.fr/',
}

/**
 * Le relief, quand c'est lui qu'on montre et non le fond de carte.
 *
 * Sur la feuille imprimée, la carte est masquée : il n'y a pas de fond, mais
 * il y a le profil altimétrique, et il vient du service de l'IGN. Écrire
 * « Fond © IGN » sur une feuille sans carte serait une attribution fausse —
 * or c'est précisément ce que le §4bis reproche à un commentaire qui
 * justifie sans être vrai.
 */
export const IGN_RELIEF: Credit = {
  ...IGN,
  quoi: 'Relief',
}

/** Les boucles communales, versées par la Métropole de Lyon. */
export const METROPOLE: Credit = {
  quoi: 'Boucles locales',
  qui: 'Métropole de Lyon',
  licence: 'Licence Ouverte',
  lien: 'https://data.grandlyon.com/',
}

/** Le fond **et** les itinéraires, quand le miroir OSM remplace l'IGN. */
export const OSM_FOND_ET_TRACES: Credit = {
  ...OSM,
  quoi: 'Fond et itinéraires',
}

/**
 * Les marques déposées de la FFRandonnée.
 *
 * Ce n'en est pas un crédit de licence — rien n'est dérivé de la
 * fédération — mais une mention de marque, et elle n'a donc ni licence ni
 * lien. Elle se compose à part.
 */
export const MARQUES_FFRANDONNEE =
  'GR®, GR de Pays® et PR® sont des marques de la FFRandonnée.'

/** ` (ODbL)`, ou rien du tout quand la licence n'a pas de nom court. */
function entreParentheses(credit: Credit): string {
  return credit.licence === undefined ? '' : ` (${credit.licence})`
}

/** Un crédit en HTML, le nom du producteur cliquable. */
function enHtml(credit: Credit): string {
  const devant = credit.devant ?? ''
  return `${credit.quoi} © ${devant}<a href="${credit.lien}">${credit.qui}</a>${entreParentheses(credit)}`
}

/** Le même crédit en texte nu — pour un canevas, ou pour du papier. */
function enTexte(credit: Credit): string {
  return `${credit.quoi} © ${credit.devant ?? ''}${credit.qui}${entreParentheses(credit)}`
}

/** Le séparateur entre deux crédits, partout le même. */
const ENTRE_DEUX = ' · '

/** La ligne d'attribution en HTML, pour le contrôle de MapLibre. */
export function attributionHtml(...credits: Credit[]): string {
  return credits.map(enHtml).join(ENTRE_DEUX)
}

/** La ligne d'attribution en texte nu, pour tout le reste. */
export function attributionTexte(...credits: Credit[]): string {
  return credits.map(enTexte).join(ENTRE_DEUX)
}

/** Le nom complet du producteur, tel qu'une attribution le nomme. */
function nomComplet(credit: Credit): string {
  return `${credit.devant ?? ''}${credit.qui}`
}

/**
 * Les crédits dus par un ensemble de provenances (issue #388).
 *
 * ## Pourquoi des provenances et non des réseaux
 *
 * Ma première version prenait des `Network` et les traduisait par une table
 * — `GR` → OpenStreetMap, `LOCAL` → Métropole, `PERSO` → rien. Elle était
 * fausse pour le cas même qui a fait écrire `attributionDe` : **le PDIPR de
 * Léa** arrive en `PERSO` et déclare « Département de l'Ain » sous Licence
 * Ouverte (issue #87). Cette table l'aurait crédité à OpenStreetMap — une
 * attribution *fausse*, c'est-à-dire le défaut de #388 aggravé plutôt que
 * corrigé.
 *
 * Et c'était une table de plus disant la même règle que le `switch` de
 * `gpxAttributionFor`, avec le trou en propre que le §4ter promet à toute
 * paire de listes. La règle est déjà nommée : `attributionDe`. On part donc
 * de sa réponse.
 *
 * ## Ce que fait celle-ci
 *
 * Elle ne décide de rien — elle **habille**. Une provenance connue reçoit sa
 * formule soignée (« Itinéraires © les contributeurs OpenStreetMap
 * (ODbL) ») ; une provenance déclarée par un fichier importé est créditée
 * sous le nom qu'elle donne, sans nom de licence puisqu'on n'en a que
 * l'adresse.
 */
export function creditsDesSources(
  sources: readonly GpxAttribution[],
): Credit[] {
  const connus = new Map<string, Credit>(
    [OSM, METROPOLE].map((credit) => [nomComplet(credit), credit]),
  )
  const credits: Credit[] = []
  for (const source of sources) {
    const credit = connus.get(source.author) ?? {
      quoi: 'Itinéraires',
      qui: source.author,
      lien: source.license,
    }
    if (!credits.some((deja) => nomComplet(deja) === nomComplet(credit))) {
      credits.push(credit)
    }
  }
  return credits
}
