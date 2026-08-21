import type { Network } from '../core/types.ts'

/**
 * Couleur de balisage par réseau, pour la carte et la légende.
 *
 * Ces valeurs sont forcément dupliquées avec les variables de src/index.css :
 * MapLibre ne lit pas les propriétés personnalisées CSS, et une feuille de
 * style ne lit pas une constante JavaScript. tests/unit/networkColors.test.ts
 * empêche les deux listes de diverger — un badge et un tracé de couleurs
 * différentes ne se remarquent qu'au moment où l'on compare, donc jamais.
 */
export const NETWORK_COLORS: Record<Network, string> = {
  GR: '#c8102e',
  GRP: '#b34a08',
  PR: '#d9a400',
  // Boucles locales open data : bleu-vert, volontairement distinct du jaune
  // PR pour ne pas confondre deux sources différentes sur la carte.
  LOCAL: '#1d7a8c',
  PERSO: '#1e2b23',
}

export const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  LOCAL: 'Boucle locale',
  PERSO: 'Itinéraire perso',
}

/** Texte court des badges (les libellés longs cassent la mise en page). */
export const NETWORK_BADGES: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GRP',
  PR: 'PR',
  LOCAL: 'Boucle',
  PERSO: 'PERSO',
}

/**
 * Ce que chaque famille veut dire, une fois (issue #145).
 *
 * Les sigles sont les bons — ce sont les mots peints sur les arbres, et les
 * remplacer par « long / moyen / court » couperait l'application du terrain.
 * Mais rien ne les introduisait : quelqu'un qui débute ne sait pas si « PR »
 * le concerne.
 */
export const NETWORK_EXPLANATIONS: Record<Network, string> = {
  GR: 'Grande Randonnée : les grands itinéraires balisés blanc et rouge, souvent sur plusieurs jours.',
  GRP: 'GR de Pays : une boucle régionale balisée jaune et rouge, de quelques jours.',
  PR: 'Promenade et Randonnée : un circuit local balisé jaune, en général de deux à six heures.',
  LOCAL:
    'Boucle communale publiée en open data par une collectivité (Métropole de Lyon, par exemple).',
  PERSO: 'Itinéraire que vous avez importé ou tracé vous-même.',
}

/**
 * Bleu de la position de l'utilisateur.
 *
 * Le point sur la carte est peint par MapLibre, qui ne lit pas les
 * propriétés personnalisées CSS ; le bouton « où suis-je », lui, ne peut pas
 * lire une constante JavaScript. La valeur existe donc forcément deux fois,
 * et `tests/unit/couleurs.test.ts` empêche les deux de diverger.
 */
export const POSITION_COLOR = '#1d6fa5'
