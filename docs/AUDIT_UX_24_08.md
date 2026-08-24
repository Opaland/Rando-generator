# Audit d'interface du 24/08 — ce que les mesures disent

Demande de Cédric : « faire un audit UI/UX complet », après avoir vu en trois
secondes deux défauts que j'aurais dû voir depuis longtemps.

Ce document n'est pas l'audit. **L'audit est
`tests/e2e/regles-d-ecran.spec.ts`** — trente-six mesures qui se reposent à
chaque exécution. Un document vieillit ; une sonde répond encore dans six
mois.

Ce qui est ici, c'est ce qu'une sonde ne peut pas porter : ce qu'elle a
trouvé, ce qu'elle refuse de juger, et les questions qui appartiennent à une
personne.

---

## 1. Ce que la sonde mesure

Cinq questions, à trois largeurs (390 / 800 / 1280), dans trois états
(accueil, zone chargée, fiche ouverte), avec le geste émulé — une fenêtre de
390 px pilotée à la souris n'est pas un téléphone. Plus trois questions en
mode gros texte.

| Question | Ce qu'elle refuse |
|---|---|
| qu'est-ce qui est peint par-dessus quoi | un panneau recouvert garde un rectangle valide ; `toBeVisible` dit oui |
| qu'est-ce qui est écrasé | un dessin rendu à un autre rapport que celui où il est composé ment |
| qu'est-ce qui déborde sans le dire | la page **et** chacun de ses conteneurs |
| qu'est-ce qu'on ne peut pas toucher | 44 px au doigt (WCAG 2.5.5), 24 au curseur (2.5.8) |
| qu'est-ce qui sort du cadre | un défilement latéral n'est jamais voulu |

---

## 2. Ce qu'elle a trouvé

Sept défauts réels, tous mesurés, aucun trouvé en relisant du code.

**Le profil altimétrique était écrasé de 30 %.** `viewBox` de rapport 3,2
rendu dans un rapport 4,9. Une montée de 300 m et une de 200 m se
ressemblaient. C'est ce que Cédric a vu en trois secondes.

**Le quart bas de la fiche n'existait pas sur téléphone.** Cent huit pixels
peints par la poignée repliée et la barre d'onglets, sur les 422 qu'elle
occupait.

**Quatre surcouches basculaient à 640 px** quand l'application bascule à 800.
Entre les deux, elles se croyaient sur grand écran pendant que React servait
la feuille glissante. À 800 px pile, la poignée peignait par-dessus la fiche.

**Le plancher des cibles n'existait nulle part.** En-têtes d'accordéon à
23 px, boutons de zone à 40, curseur de tolérance à 16 — celui qui règle ce
qui compte comme parcouru, et qu'on déplace au doigt. Les cinq commandes de
zoom du profil à 28.

**Le bouton « Ma position » recouvrait la fiche** sur grand écran.

**« Stabilisé » était peint du jaune des PR** et « naturel » du bleu des
boucles locales, dans le profil. Invisible tant que ces bandes vivaient sous
une courbe ; intenable dès qu'elles sont posées sur la carte.

**`hut` valait exactement le rouge GR**, et `water` exactement le bleu de
« où suis-je ». Deux collisions bit pour bit.

---

## 3. Ce qu'elle a trouvé sur elle-même

Trois fois, la sonde s'est révélée aveugle — et chaque fois c'est une
injection qui l'a dit, jamais une relecture.

**Elle n'auscultait qu'un écran.** Le profil réécrasé passait au vert :
il n'existe pas sur l'écran d'accueil. Élargie aux trois états, elle a trouvé
les commandes de zoom du profil dans la minute.

**Elle mesurait le plancher de bureau en croyant mesurer celui du doigt.**
`@media (pointer: coarse)` ne s'active pas sans émuler le tactile : les
hauteurs restaient à 32 px après un correctif qui les portait à 44, et
c'était le test qui avait tort.

**Elle ne voyait pas ce qui déborde dans un panneau.** Un en-tête de
1 600 px posé dans la colonne latérale ne fait pas déborder la page : la
colonne le rogne, et le `scrollWidth` du document ne bouge pas. Pire : la
règle existait en **deux copies**, j'ai corrigé l'une et laissé l'autre, si
bien que l'injection restait verte dans le mode même qu'elle visait — le
mode d'échec du §4, dans le fichier écrit pour l'empêcher.

> **Une sonde se juge sur ce qu'elle trouve quand on remet un défaut, pas
> sur le nombre de ses assertions.**

---

## 4. Ce que la sonde refuse de juger, et pourquoi

Elle ne dit pas si une couleur est jolie ni si un texte est clair. Ces
choses se décident ; les prétendre mesurables serait le faux confort que le
§2 interdit.

Quand un seuil vient d'une norme, il est nommé : 44 px est WCAG 2.5.5, 24 px
est WCAG 2.5.8, 3:1 est le plancher de contraste non textuel. **Le seul
nombre tranché au jugement dans tout le plancher des cibles est le 32 px de
confort au curseur**, et il est écrit comme tel. Le ΔE 20 des codes couleur
aussi.

Un seuil emprunté n'a pas le même statut qu'un seuil inventé, et confondre
les deux est exactement ce que le §2 interdit.

---

## 5. Ce qui reste à décider — par une personne, pas par moi

Ces questions ont été rencontrées pendant l'audit. Aucune n'a de réponse en
chiffres. Aucune n'est tranchée ici.

**En gros texte, élider davantage va-t-il contre le but ?**
Le sous-titre d'un itinéraire s'élide avec « … » quand il dépasse — une
troncature déclarée, pas un rognage. Mais celui qui agrandit les textes est
justement celui qui lit mal, et en gros texte on élide **plus tôt**. Faut-il
alors passer à la ligne, quitte à changer la hauteur des lignes de la liste ?
*Ce qu'il faudrait pour trancher : montrer les deux à Théo.*

**Le mode gros texte est-il assez gros ?**
Il porte la racine à 125 %. C'est un choix ancien, jamais éprouvé sur
quelqu'un. Le test de 320 % montre que la mise en page tient — donc rien
n'empêche techniquement d'aller plus loin.
*Ce qu'il faudrait : une séance avec deux personnes qui lisent mal de près.*

**Les commandes de zoom du profil sont-elles au bon endroit ?**
Elles sont maintenant à 44 px, mais elles sont cinq, alignées sous un
graphique de 100 px de haut, et il faut avoir compris qu'on peut zoomer un
profil. La taille était mesurable ; l'utilité ne l'est pas.
*Ce qu'il faudrait : regarder quelqu'un chercher un passage raide.*

**Le compteur de sorties réseau est-il lu ?**
C'est le seul endroit où la promesse du produit est *montrée*. Il est dans
« À propos », c'est-à-dire là où personne ne va.
*Ce qu'il faudrait : demander à quelqu'un s'il a compris que rien ne sort.*

---

## 6. Ce qui n'a pas encore été ausculté

Dit ici pour ne pas laisser croire l'audit complet :

- **le contraste texte / fond**, mesuré à l'écran plutôt que dans la
  palette. Les jetons sont gardés par `couleurs.test.ts`, mais rien ne
  vérifie ce que donne un texte gris sur un fond clair *après* composition ;
- **le mode simple** (issue #173), qui cache des sections : les règles
  d'écran n'y tournent pas ;
- **les états d'erreur et les états vides**, qui sont ceux où l'on se sent
  le plus perdu et que la sonde ne traverse jamais.

Chacun est une sonde à écrire, pas un paragraphe à ajouter ici.

### Ce qui a été ausculté depuis

Deux des cinq surfaces ont leur sonde, `tests/e2e/regles-de-clavier.spec.ts`,
et toutes deux ont trouvé du réel :

- **la visibilité du focus.** `--anneau-focus` existait, le gros texte
  l'épaississait, et il ne posait rien : la valeur était de forme
  `box-shadow`, employée en `outline`. Une substitution de `var()` invalide
  ne laisse pas gagner la règle du dessous — elle ramène la propriété à sa
  valeur initiale. Trois éléments n'avaient plus de liseré du tout, et
  l'onglet actif n'avait plus rien ;
- **ce qui reste atteignable au clavier.** Feuille repliée à 52 px, la
  tabulation traversait **vingt-six** éléments qu'aucun pixel ne montrait.
  `overflow: hidden` cache sans retirer.

### La question qui reste, et pourquoi elle n'est pas tranchée

**Un élément recouvert par un panneau ouvert doit-il rester atteignable au
clavier ?**

Le cas concret : sur téléphone, feuille à mi-hauteur, l'attribution de la
carte est derrière. La tabulation y va, on ne la voit pas. Mais la carte
elle-même est à moitié visible et parfaitement utilisable, et la rendre
inerte serait pire.

Il n'y a pas de mesure qui tranche cela : le même fait — « c'est derrière un
panneau » — est un défaut dans un cas et le fonctionnement normal dans
l'autre. La sonde du clavier ne pose donc la question que là où la mise en
page a **délibérément fermé** quelque chose. Une règle qui rougirait sur un
panneau qui recouvre la carte finirait désactivée, et emporterait le reste
avec elle.

Ce qu'il faudrait pour décider : regarder quelqu'un se servir de
l'application au clavier, feuille ouverte, et voir s'il perd le fil. C'est
une session, pas un test.
