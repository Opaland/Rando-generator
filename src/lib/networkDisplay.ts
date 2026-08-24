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
  /*
    Réseau non déclaré (issue #284) : une prune sourde, choisie pour ne
    ressembler à aucun balisage réel — aucune fédération française ne balise
    dans ce registre.

    C'est un seuil de **présentation** — il ne change rien à ce qui est
    calculé — donc il se tranche au jugement, à condition d'écrire les pistes
    envisagées et écartées (CLAUDE.md §2) :

    - garder le jaune du PR : c'était le défaut lui-même, en plus discret ;
    - un jaune désaturé : trop proche du PR sur un écran de téléphone au
      soleil, et la distinction ne survivrait pas au premier reflet ;
    - **un gris neutre** — l'idée évidente, et la seule qui ait été écartée
      par la mesure plutôt que par le raisonnement. `#5f5a50` était écrit,
      puis `tests/unit/terrainCouleurs.test.ts` l'a refusé : ΔE 12,8 du
      « dur » et 16,5 de l'« autre » des bandes de terrain, pour un seuil de
      20. Les gris de la carte étaient déjà pris ; l'incertitude ne pouvait
      pas être grise sans se confondre avec un revêtement ;
    - le même jaune en trait pointillé, l'incertitude dite par la forme
      plutôt que par la couleur. C'est la meilleure réponse, et elle reste à
      faire : elle demande un motif de tiret par réseau dans MapLibre, et la
      légende aurait de toute façon besoin d'une couleur.

    La valeur est mesurée, pas choisie à l'œil :

      blanc sur #882a5a → 8,31:1   (WCAG 1.4.3 AA en demande 4,5)
      #882a5a sur le papier → 7,78:1
      ΔE le plus court contre **les vingt et une** couleurs déjà prises
      (réseaux, terrain, POI, base) → 30,6, pour un seuil de 20
  */
  INCONNU: '#882a5a',
}

export const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  LOCAL: 'Boucle locale',
  PERSO: 'Itinéraire perso',
  INCONNU: 'Réseau non déclaré',
}

/** Texte court des badges (les libellés longs cassent la mise en page). */
export const NETWORK_BADGES: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GRP',
  PR: 'PR',
  LOCAL: 'Boucle',
  PERSO: 'PERSO',
  // « ? » plutôt que « NC » ou « Autre » : le point d'interrogation dit
  // l'incertitude sans jargon et sans occuper la place d'un mot. « Autre »
  // affirmerait qu'il y a un autre balisage, ce qu'on ne sait pas non plus.
  INCONNU: '?',
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
  INCONNU:
    'OpenStreetMap ne déclare aucun réseau pour cet itinéraire. Ce peut être un PR balisé que personne n’a qualifié, comme un tracé sans le moindre balisage sur le terrain : à vérifier avant de partir.',
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
