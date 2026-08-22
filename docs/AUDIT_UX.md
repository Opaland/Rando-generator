# Audit UI/UX — Sentiers, 22/08/2026

Audit de l'application **telle qu'elle est déployée**, et non des diffs
récents : ce que voit quelqu'un qui l'ouvre aujourd'hui, sur téléphone, sur
tablette et sur portable.

Il fait suite à `AUDIT_MOBILE.md` (20/08), dont les neuf constats M0–M8 ont
tous été traités. Trois d'entre eux sont **revenus** par des chemins
différents — c'est le principal enseignement de celui-ci : une correction
mesurée à un endroit ne tient pas à un autre.

Le contexte est neuf depuis : les onglets sont devenus la disposition par
défaut sur téléphone, le système typographique a été mis à plat, le
revêtement est arrivé sur le profil, et deux surfaces sont devenues
refermables.

## Verdict

**Trois défauts empêchent d'utiliser une partie de l'application**, et l'un
des trois frappe précisément la personne qui l'ouvre pour la première fois
sur un téléphone. Aucun n'était visible en relisant du code : il a fallu
regarder l'écran et mesurer ce qui recouvre quoi.

Le reste est du raffinement — mais deux points de contenu disent quelque
chose de faux, et l'attribution OpenStreetMap est partiellement masquée, ce
qui touche la licence et pas seulement l'esthétique.

## Méthode

Dix-huit captures dans les états réels, à quatre largeurs (390, 800, 810,
1280), avec la zone PNR du Pilat chargée, puis mesure des rectangles et de
ce qui est **réellement peint** à un point donné (`elementFromPoint`), plutôt
qu'un jugement à l'œil. Chaque constat ci-dessous porte son chiffre.

---

## P0 — ce qui empêche d'utiliser l'application

### U1 — sur téléphone, « Voir un exemple » est sous la feuille au premier lancement

C'est le défaut le plus grave de cet audit, parce qu'il frappe la première
seconde de la première visite.

Le guide de premier lancement propose « Voir un exemple », qui charge des
boucles réelles et trois sorties fictives. C'est **le seul chemin qui montre
le produit à quelqu'un qui n'a encore aucune trace**. Sur un écran de
390 × 844 :

| | |
|---|---|
| Carte du guide | y 191 → 708 |
| Haut de la feuille | y **439** |
| Bouton « Voir un exemple » | y 485 → 529 |
| `elementFromPoint` au centre du bouton | ne renvoie pas le bouton |

Le bouton est **46 px sous le bord de la feuille**, donc recouvert et non
cliquable. La troisième étape du guide est coupée au même endroit.

C'est le constat **M5** qui revient par une autre porte : il avait été
corrigé en bornant la hauteur de la carte du guide, mais la feuille glissante
est au-dessus dans l'ordre d'empilement (`--z-overlay-guide: 4` contre le
plan de la feuille), et personne n'avait remesuré le guide **avec la feuille
ouverte à mi-hauteur**, qui est justement son état à la première visite.

### U2 — à exactement 800 px de large, l'application est amputée

Mesuré aux trois largeurs qui encadrent le point de rupture :

| largeur | barre d'onglets rendue | barre visible | sections filtrées par onglet | **amputé** |
|---|---|---|---|---|
| 799 px | oui | oui | oui | non |
| **800 px** | oui | **non** | **oui** | **oui** |
| 801 px | non | non | non | non |

À 800 px exactement, React filtre les sections par onglet *et* le CSS masque
la barre qui permet d'en changer. « Sorties », « Progression » et
« Réglages » deviennent inatteignables.

La cause tient en un pixel :

- `src/lib/ecran.ts` teste `(max-width: 800px)` — **vrai** à 800 ;
- `src/components/BarreOnglets.module.css` masque la barre sous
  `@media (min-width: 800px)` — **vrai** à 800 aussi.

L'ironie mérite d'être notée : cette règle CSS a été écrite comme *filet*
contre exactement ce défaut, avec ce commentaire — « cette règle reste comme
filet, pour le cas d'un redimensionnement pendant lequel React n'aurait pas
encore repeint ». Le filet a ouvert le trou qu'il devait couvrir.

Ce n'est pas un cas de laboratoire : 800 px est la largeur d'un iPad en
portrait à zoom par défaut, et d'une fenêtre de navigateur posée à la moitié
d'un écran 1600.

### U3 — changer d'onglet ne montre pas l'onglet

Sur téléphone, le geste normal est de replier la feuille pour regarder la
carte. En repartant de là :

| | |
|---|---|
| Hauteur de la feuille avant | 52 px (repliée) |
| On touche « Progression » | l'onglet s'allume |
| Hauteur de la feuille après | **52 px** |

L'onglet actif change, l'écran ne change pas. Il faut deviner qu'il reste un
second geste à faire — tirer la poignée — pour voir ce qu'on venait
chercher. La position de la feuille est partagée entre les quatre onglets,
alors que « Carte » veut une feuille basse et « Progression » une feuille
haute.

---

## P1 — ce qui trompe, ou gêne pour de bon

### U4 — l'attribution OpenStreetMap est recouverte sur un tiers de sa largeur

Sur 1280 px, zone chargée :

| | x | largeur |
|---|---|---|
| Attribution | 602,7 → 1242,0 | 639,3 px |
| Légende de carte | 402,0 → 804,6 | 402,6 px |
| Recouvrement | 602,7 → 804,6 | **201,9 px, soit 32 %** |

`elementFromPoint` au début du texte d'attribution renvoie la légende, pas
l'attribution. Le texte masqué est le **début** de la mention :
« MapLibre | Fond et itinéraires © les contri… ». À 810 px le recouvrement
est total et la mention devient illisible.

Ce n'est pas qu'une gêne : l'ODbL demande une attribution visible, et la
Licence Ouverte de la Métropole de Lyon aussi. C'est le constat **M7**, qui
avait été corrigé sur téléphone et jamais vérifié sur les largeurs
supérieures.

### U5 — « 0 % parcourus » s'affiche avant qu'il y ait quoi que ce soit à parcourir

À la toute première ouverture, sans zone ni trace, la poignée annonce
« 0 % parcourus ». Le libellé « Zones, traces et réglages » existe pour ce
cas exactement, mais il cède dès que le calcul rend `0` au lieu de `null`.

Accueillir quelqu'un par un zéro est un mauvais premier chiffre, et c'est
surtout un chiffre **faux** : il n'y a pas 0 % de parcouru, il n'y a rien à
parcourir.

### U6 — la légende mange 28 % de la carte visible sur téléphone

Feuille repliée, la carte dispose de 350 px de hauteur. La légende en occupe
100 en permanence, en haut, là où se trouve le tracé après un cadrage. Six
entrées (GR, GR de Pays, PR, Boucle locale, Itinéraire perso, parcouru /
restant) dont la moitié ne concerne pas la zone affichée.

### U7 — « Les trois » ne dit pas de quoi il s'agit

Le libellé de zone est littéralement `'Les trois'` (`src/core/overpass.ts`).
Ce n'est pas une troncature CSS : il y a la place de l'afficher en entier sur
toutes les largeurs. La zone réunit Rhône + Loire + Pilat ; son nom devrait
le dire.

### U8 — entre 800 et 1100 px, la colonne est trop étroite pour son contenu

À 810 px, la colonne fait 307 px, et le contenu se casse :

- « Rhône + / Métropole de / Lyon » sur trois lignes ;
- « AUVERGNE-RHÔNE-ALPES, PAR / DÉPARTEMENT » sur deux ;
- le champ « ex. Saint-Étienne » tronque son propre exemple.

Le palier existe pour que la carte ne soit pas réduite à une moitié d'écran.
L'intention est bonne, la largeur retenue ne l'honore pas.

---

## P2 — cohérence

### U9 — trois traitements pour l'action principale

| Bouton | Traitement |
|---|---|
| « Voir un exemple » (guide) | vert-noir plein |
| « Ajouter un itinéraire » | rouge balisage plein |
| « Chercher » (désactivé) | rouge à 55 % d'opacité |

Le troisième mérite un mot : `opacity: 0.55` sur du rouge balisage posé sur
le papier crème donne un rose dont le contraste **effectif** est de 1,87:1
(le contraste nominal de 5,88 ne tient pas compte de l'opacité). Un contrôle
désactivé est exempté du critère WCAG 1.4.3, donc ce n'est pas une
non-conformité — mais il ne se lit pas comme « désactivé », il se lit comme
une troisième couleur de marque.

### U10 — le titre de la fiche détail se casse en trois lignes

« GR 7 — / Traversée du / Pilat », parce que « Incliner la carte » prend
145 px des 380 de la fiche. Le sous-titre est le seul endroit qui nomme
l'itinéraire en toutes lettres.

### U11 — des émojis en couleur dans une palette qui n'en a pas

La barre d'onglets porte 🗺 👟 📈 ⚙ en couleurs natives, contre une palette
par ailleurs tenue à quatre teintes (rouge balisage, jaune PR, orange GRP,
bleu boucle) sur papier crème.

### U12 — « Glissez vos fichiers GPX » sur un téléphone

Le glisser-déposer n'existe pas au doigt. Le lien « parcourez vos fichiers »,
juste en dessous, fait le travail — c'est lui qui devrait mener.

### U13 — le bouton qui rend le panneau replié est petit et sans nom

28 × 44 px, collé au bord gauche, un chevron sans étiquette. Replier le
panneau est facile à faire par curiosité ; le retrouver l'est moins. Ce
bouton date de ce matin (PR #213) : le défaut est frais, et il est de la même
famille que ceux que cet audit reproche au reste.

---

## Ce qui va bien, et qu'il ne faut pas casser

- **Aucun débordement horizontal** à aucune des quatre largeurs.
- La hiérarchie typographique tient : après la mise à plat, les tailles
  viennent toutes de jetons, et l'échelle se lit à l'écran.
- Le profil altimétrique avec sa bande de revêtement est dense mais lisible,
  et la légende dit honnêtement ce qui est relevé, déduit, ou inconnu.
- Les états vides parlent (« Aucune trace pour l'instant »).
- Le guide, sur les largeurs où il est entièrement visible, dit en trois
  étapes ce que fait le produit.
- La phrase de confidentialité est en en-tête sur toutes les largeurs, dans
  deux longueurs adaptées.

## Ce que cet audit apprend sur la méthode

Trois constats de l'audit du 20/08 sont revenus : M5 (guide tronqué), M7
(attribution recouverte), et le défaut de point de rupture que `ecran.ts`
documente comme ayant « fait s'enliser la suite e2e entière ».

Ils ne sont pas revenus par négligence : chacun avait été corrigé et mesuré.
Ils sont revenus parce que la mesure portait sur **un état et une largeur**,
et que l'état ou la largeur a changé depuis — le guide n'avait jamais été
mesuré avec la feuille ouverte, l'attribution jamais au-dessus de 800 px, le
point de rupture jamais *à* 800 px.

La leçon est reproductible : figer la mesure dans un test e2e ne suffit pas
si le test ne couvre qu'un point de l'espace. Les trois défauts P0 sont
maintenant chacun à une frontière : premier lancement, largeur exacte du
point de rupture, changement d'onglet depuis l'état replié. C'est là qu'il
faut mesurer.
