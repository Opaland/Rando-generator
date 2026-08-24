# Le système visuel de Sentiers

> Écrit à l'issue #176. Ce n'est pas une bibliothèque de composants, et ça ne
> le deviendra pas : la sobriété est ici un choix, pas un manque.

Tout tient dans `src/index.css` et les CSS Modules des composants. Aucune
dépendance visuelle, aucune police distante — ce qui est cohérent avec la
promesse : les requêtes de polices ne quittent pas le navigateur non plus.

---

## Couleurs

Nommées par **l'usage**, jamais par la teinte. `--rouge-balisage` dit ce que
la couleur signifie ; `--rouge-vif` n'aurait rien dit et aurait survécu à un
changement de palette.

### Balisage

| Token | Valeur | Ce que c'est |
|---|---|---|
| `--rouge-balisage` | `#c8102e` | GR |
| `--orange-grp` | `#b34a08` | GR de Pays — foncé pour tenir 4,5:1 avec du texte blanc |
| `--jaune-pr` | `#d9a400` | PR |
| `--prune-inconnu` | `#882a5a` | Réseau non déclaré (#284) |
| `--bleu-local` | `#1d7a8c` | Boucles locales open data |

### Surfaces et texte

`--blanc-papier`, `--vert-noir`, `--gris-vert`, `--gris-vert-clair`.

### États

| Token | Ce que ça dit |
|---|---|
| `--erreur-fond` / `--erreur-bord` | Quelque chose a échoué |
| `--attention-fond` / `--attention-bord` | **À vous de voir** — ni échec, ni réussite, ou une information à connaître |
| `--danger-fond` / `--danger-fond-fort` / `--danger-texte` | Suppression, confirmation à deux temps |
| `--bleu-position` | Où vous êtes |

Il n'y a **qu'un** jeton pour le registre « à vous de voir ». Deux ont
cohabité un temps — `--attention-fond` et `--alerte-fond`, deux jaunes
distants d'un chiffre hexadécimal — parce qu'ils avaient été introduits par
deux sprints différents, chacun ne voyant que sa moitié. Si vous êtes tenté
d'ajouter un troisième jaune, c'est probablement celui-ci que vous cherchez.

La distinction entre `--erreur-*` et `--attention-*` n'est pas cosmétique.
Le rouge dit « on a raté » ; un doublon supposé ou une démonstration en cours
ne sont pas des échecs, ce sont des états dans lesquels on demande à la
personne de trancher. Les peindre en rouge serait leur mentir.

---

## Espacement

Huit paliers. Le pas de 2 px jusqu'à 12 px n'est pas un choix de goût : c'est
ce que les seize valeurs préexistantes dessinaient déjà.

| Token | Valeur |
|---|---|
| `--espace-1` | 2px |
| `--espace-2` | 4px |
| `--espace-3` | 6px |
| `--espace-4` | 8px |
| `--espace-5` | 10px |
| `--espace-6` | 12px |
| `--espace-7` | 16px |
| `--espace-8` | 24px |

**Rien en dur.** Une valeur d'espacement écrite à la main est un palier de
plus, et c'est ainsi qu'on repasse de huit à seize.

Deux exceptions légitimes, et elles se commentent sur place :

- les **cibles tactiles** (`min-height: 44px`) — une contrainte
  d'accessibilité, pas une décision de mise en page ;
- les **gabarits** (`max-width: 420px`, points de rupture) — des seuils, pas
  des espaces.

---

## Rayons et ombres

| Token | Valeur | Usage |
|---|---|---|
| `--rayon-xs` | 2px | Marqueurs, puces |
| `--rayon-sm` | 4px | Boutons, champs |
| `--rayon-md` | 6px | Cartes, panneaux |
| `--rayon-lg` | 10px | Grandes surfaces flottantes |

Trois familles d'ombres, distinguées par **ce qu'elles portent** et non par
leur taille :

| Token | Ce qu'elle porte |
|---|---|
| `--ombre-flottante` | Ce qui flotte au-dessus de la carte |
| `--ombre-panneau` | Dialogues, carte d'accueil |
| `--ombre-feuille` | La feuille mobile — elle monte, son ombre va vers le haut |
| `--anneau-selection` | La ligne **choisie** dans une liste (forme d'ombre) |

Le liseré de focus, lui, n'est pas une ombre : c'est un `outline`, et il a
son propre jeton.

| Token | Propriété | Emploi |
|---|---|---|
| `--contour-focus` | `outline` | le liseré de focus, partout où il est resserré |
| `--anneau-selection` | `box-shadow` | la ligne choisie dans une liste |

**Les deux ne s'échangent pas**, et ce n'est pas une question de goût. Un
jeton de forme `box-shadow` posé en `outline` rend la déclaration invalide au
moment du calcul : la propriété retombe à sa valeur initiale — `outline-style:
none` — au lieu de laisser gagner la règle générale du dessous. Le liseré
disparaît alors **complètement**, y compris celui qu'une règle antérieure
posait. Un jeton nommé « focus » a ainsi supprimé le focus de trois éléments
pendant tout un cycle. `tests/unit/jetonsDeFocus.test.ts` refuse maintenant
l'échange.

Une pilule (`border-radius: 22px` sur un bouton de 44 px) n'appartient pas à
l'échelle : c'est la moitié d'une hauteur, et la tokeniser la casserait au
premier changement de palier.

---

## Typographie

Deux familles, aucune distante : `--font-display` (titres) et `--font-sans`.

Trois paliers de texte secondaire, qui existent pour qu'**un seul endroit**
décide de leur taille — l'application se lit dehors, en marchant, en plein
soleil, et pas seulement à vingt centimètres dans un salon
(`docs/AUDIT_MOBILE.md`, constat M8) :

| Token | Valeur | Pour |
|---|---|---|
| `--texte-etiquette` | 0.72rem | Badges de réseau |
| `--texte-appui` | 0.78rem | Mentions discrètes, légende |
| `--texte-secondaire` | 0.85rem | Second niveau de lecture courant |

---

## Boutons

Quatre familles, en classes globales — **19 usages dans 8 composants**
(recompté). Ce n'est pas un système déclaré puis ignoré.

| Classe | Pour |
|---|---|
| `.btn-primary` | L'action principale d'un panneau |
| `.btn-secondary` | Les autres |
| `.btn-link` | Une action qui ressemble à un lien |
| `.btn-icon-close` | Fermer |

---

## Accordéons

`.acc-summary` sur le `<summary>` d'un `<details>`. Le chevron est en
`::after` ; les marqueurs natifs sont retirés des deux moteurs
(`::-webkit-details-marker` **et** `::marker`).

---

## Empilement

Sept paliers de `z-index` tokenisés, du plus bas au plus haut. **Un seul
endroit à consulter** avant d'ajouter un overlay — c'est ce qui traite en
amont la source la plus fréquente de bugs de superposition.

`--z-overlay-legend` (3) · `guide` (4) · `card` (5) · `detail` (6) · `draw`
(7) · `locate` (8) — et la suite dans `src/index.css`.

---

## La duplication JS/CSS, et pourquoi il ne faut pas la « corriger »

**Lisez ceci avant de factoriser quoi que ce soit.**

Certaines couleurs existent **forcément deux fois** :

- MapLibre peint les tracés et les points : il ne lit pas les propriétés
  personnalisées CSS ;
- les badges de la barre latérale et le bouton « où suis-je » sont peints par
  le CSS : ils ne peuvent pas lire une constante JavaScript.

La duplication n'est donc pas une négligence, c'est la conséquence de deux
moteurs de rendu qui ne partagent rien. Un contributeur bien intentionné qui
supprimerait la constante JS pour « n'avoir qu'une source de vérité »
casserait la coloration de la carte.

Ce qui protège l'ensemble : **`tests/unit/couleurs.test.ts`**. Il compare
chaque constante JS à la variable CSS correspondante et échoue si les deux
divergent. Un décalage entre la couleur d'un badge et celle du tracé ne se
remarquerait qu'en les regardant côte à côte, c'est-à-dire jamais.

Si vous ajoutez une couleur partagée entre les deux mondes, ajoutez-la à ce
test dans le même commit.

Depuis le 23/08, les quatre couleurs de base — papier, encre, gris-vert,
blanc de balisage — vivent dans `src/lib/couleursPartagees.ts` et sont
gardées de la même façon. La duplication JS/CSS est inévitable ; la recopie
**à l'intérieur** du monde JS ne l'était pas, et elle avait laissé six
`#1e2b23`, trois `#faf7f2` et un `#c1272d` orphelin s'installer sans que rien
ne le signale.

---

## Le code couleur des points d'intérêt

Douze teintes posées une par une au fil des lots ne font pas un code. Mesuré
le 23/08, l'assortiment portait trois défauts qu'aucune relecture n'attrape :

- **`hut` valait exactement le rouge GR** — la pastille d'un refuge était bit
  pour bit la couleur d'un tracé ;
- **`water` valait exactement le bleu de la position** — un point d'eau et
  « où suis-je », même point de 6 px, même couleur ;
- **`ruins` et `marker` étaient à ΔE 11,7**, en dessous de ce qui se
  distingue sur une pastille. Quatre autres paires étaient sous 20.

La règle, désormais : **une famille, une teinte ; à l'intérieur d'une
famille, la clarté dit l'engagement.**

| Famille | Catégories | Teinte |
|---|---|---|
| Dormir | refuge gardé · gîte d'étape · couchage libre | violet, du foncé au clair |
| Halte | pique-nique · abri météo | vert |
| Relief | sommet · col · point de vue | terre et regard |
| Eau | point d'eau | bleu profond |
| Patrimoine | monument · vestige · croix ou borne | minéraux sourds |

L'abri météo a changé de famille : il était au milieu des couchages, il est
avec la halte. **On n'y dort pas** — la distinction que les issues #23 puis
#161 ont défendue, et qui se lit maintenant sur la carte sans ouvrir la
fiche.

`tests/unit/poiCouleurs.test.ts` tient trois règles **calculées**, pas
recopiées : contraste ≥ 3:1 contre le liseré, ΔE ≥ 20 de toute couleur de
balisage et du bleu de position, ΔE ≥ 20 entre familles et ≥ 15 à
l'intérieur d'une famille. Une teinte changée au jugement rougit si elle sort
du code.

Le seuil de ΔE 20 en CIE76 est posé au jugement, faute d'étude sur des
pastilles de six pixels : c'est deux fois le seuil usuel de « différence
nette » sur un aplat large, et exactement l'écart qui manquait à
`ruins`/`marker`. Ce qu'il faudrait pour trancher mieux : montrer la carte à
quelqu'un et lui demander de nommer deux pastilles voisines.

Et le code se lit quelque part : la fiche détail porte la pastille à côté de
chaque point. Sans elle, douze couleurs étaient peintes par MapLibre sans la
moindre légende.

---

## Ce qu'on ne fera pas

**Introduire une bibliothèque de composants.** Elle alourdirait le paquet
livré et trahirait une sobriété qui est ici un choix. Il n'y a rien à
réécrire — tout est déjà tokenisé.
