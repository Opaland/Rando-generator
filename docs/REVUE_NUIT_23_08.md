# Revue du sprint de la nuit du 23/08/2026

Sept PR (#232 à #238), toutes fusionnées et déployées. Cette revue regarde
**l'application**, pas les diffs — c'est ce qui distingue une revue de
sprint d'une relecture transversale, et c'est de cette distinction que sont
sortis les trois défauts ci-dessous.

Elle dit aussi ce qui a été **vérifié sans rien changer**. Une vérification
qui ne débouche sur rien reste une vérification, et ne pas l'écrire revient
à la refaire.

---

## Ce qui a été livré

| PR | |
|---|---|
| #232 | Le guide de premier lancement recouvrait l'attribution — trouvé à la revue de la nuit précédente |
| #233 | #152, pierre 2 : la sortie survit à un onglet tué |
| #234 | #152, pierre 3 : Sentiers enregistre une sortie, du bouton à la trace |
| #235 | Une sortie de quatre heures tient — mesuré ; protocole de batterie écrit |
| #236 | Trois tests de la porte mesuraient la machine, pas le code |
| #237 | Voir sa sortie pendant qu'on la marche |
| #238 | Un état transitoire ne se guette pas, il se retient |

**La boucle du produit est refermée.** Jusqu'à cette nuit, pour voir sa
progression, il fallait enregistrer sa sortie dans Strava ou Garmin,
l'exporter et l'importer ici : la proposition de valeur dépendait d'un
concurrent. C'est ce que l'audit externe du 20/08 appelait le seul problème
existentiel du produit.

---

## Les trois défauts trouvés en regardant l'application

### 1. Sur téléphone, on ne pouvait pas démarrer une sortie

Les quatre tests d'enregistrement de #234 tournaient à la largeur par
défaut de Playwright, où **toutes les sections s'affichent en même temps**.
Sur un téléphone, les onglets filtrent, et l'écran de marche vit sous
« Sorties ».

Le trou a été trouvé en essayant de cliquer « Démarrer » à 390 px : le
bouton n'était pas là. Un cinquième test suit désormais le parcours d'un
téléphone de bout en bout.

C'est la troisième fois en deux nuits qu'un test couvre **un point de
l'espace** et manque le reste — après la largeur unique de U4 et la hauteur
unique du guide. Le motif est stable : *ce n'est pas le test qui manque,
c'est la deuxième configuration.*

### 2. On marchait en regardant une carte vide

Le tracé n'apparaissait qu'une fois la sortie terminée et rangée. Le
produit s'appelle Sentiers ; il ne montrait le sentier qu'après coup.

### 3. Rien ne disait qu'un enregistrement tournait

En revenant sur l'onglet « Carte », plus aucune trace de la sortie. On range
son téléphone en croyant avoir fini, et le GPS tourne jusqu'à la nuit.

---

## Quatre tests qui mesuraient la machine

Le plus instructif du sprint, et aucun des quatre n'était visible en
relisant : trois ont été montrés par **l'écart entre ma machine et celle
d'intégration**, le quatrième par la charge d'une suite complète.

| test | ce qu'il mesurait vraiment |
|---|---|
| coût d'écriture | le temps, qui change sous l'instrumentation de couverture |
| onglet « Sorties » | treize pixels de marge, donc les métriques de police |
| grille des zones | **rien du tout** — une boîte absente repliée sur `?? 0` devenait une réponse |
| bascule de miroir | la vitesse à laquelle une doublure répond |

Le troisième mérite d'être retenu : `Math.abs((rhone?.y ?? 0) - (loire?.y ?? 0)) < 4`
concluait « pas la même ligne » quand l'une des deux zones n'était pas
encore mesurable. Un repli silencieux qui transforme une absence de donnée
en verdict est pire qu'une erreur : il passe le plus souvent.

Le quatrième donne sa formule au motif : **un état transitoire ne se guette
pas, il se retient.** Le message « nouvelle tentative » ne vit qu'entre
l'échec d'un miroir et la réponse du suivant ; la doublure du second attend
maintenant qu'on la relâche.

Les quatre sont corrigés vers des mesures qui ne dépendent d'aucune machine
— un **compte** d'enregistrements écrits, l'élément qui **ouvre** l'onglet,
un `null` qui fait attendre au lieu de trancher, une réponse qu'on retient
le temps d'observer.

---

## Vérifié sans rien changer

- **Accessibilité de l'écran de marche** : `axe-core` (WCAG 2 A/AA) sur un
  téléphone de 390 px, sortie en cours puis en pause — **aucune violation**,
  ni sérieuse ni critique. Le témoin de la barre d'onglets porte son annonce
  complète, et sa distinction marche/pause est une différence de forme
  (plein contre creux), lisible sans distinguer le rouge.
- **Coût d'une sortie de quatre heures** : recalcul des chiffres 6,9 ms une
  fois par seconde, production de la trace finale 6,3 ms, croissance
  linéaire jusqu'à 28 800 points. Rien à optimiser.
- **Coût d'écriture** : relire `count()` avant chaque point faisait passer
  le rapport de 1,6 à 2,8 entre les cent dernières écritures et les cent
  premières. Corrigé — mais l'écart est trop fin pour qu'un test le garde,
  et c'est écrit dans le test plutôt que sous-entendu.

---

## Ce qui reste ouvert

Trois constats de cette revue n'ont **pas** été corrigés, et il vaut mieux
les écrire que les redécouvrir :

1. **La zone de dépôt de fichiers n'est plus visible sans faire défiler**
   quand on ouvre « Sorties » sur un téléphone — conséquence assumée du
   rangement (enregistrer passe devant importer), mais à mesurer.
2. **Pas de témoin d'enregistrement sur grand écran avec le panneau
   replié** : la barre d'onglets n'existe pas à cette largeur. Cas plus
   étroit — il faut avoir replié le panneau soi-même — et une deuxième
   surface à tenir ne s'ajoute pas sans décision.
3. **La poignée de la feuille annonce toujours « Zones, traces et
   réglages »** pendant qu'une sortie s'enregistre, alors qu'elle pourrait
   dire la distance. C'est le libellé de U5 ; le changer touche un état déjà
   arbitré.

Et **U11** (les émojis en couleur de la barre d'onglets) reste ouvert
depuis l'audit UX : c'est un choix de design, pas un défaut mesuré. Il ne se
tranche pas seul de nuit.

---

## Ce que ce sprint apprend

Deux nuits de suite, la revue a trouvé un défaut que la porte complète
n'avait pas vu — et deux fois pour la même raison : **la porte vérifie ce
qu'on lui a appris à vérifier.** Elle ne regarde pas l'écran.

Le remède n'est pas d'ajouter des tests au hasard mais de choisir la
deuxième configuration à la main : une autre largeur, une autre hauteur, un
autre état. Les trois défauts de cette nuit étaient tous à une frontière que
personne n'avait franchie — le téléphone, la carte pendant la marche,
l'onglet qu'on quitte.
