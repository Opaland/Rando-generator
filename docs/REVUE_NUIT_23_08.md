# Revue du sprint de la nuit du 23/08/2026

Douze PR (#232 à #243), toutes fusionnées et déployées. Cette revue regarde
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
| #239 | Cette revue, et la feuille de route remise à jour |
| #240 | La poignée dit la sortie qu'on est en train de marcher |
| #241 | Le bouton qui rend le panneau annonce la sortie, lui aussi |
| #242 | Démarrer une sortie quitte la démonstration |
| #243 | Dire que Sentiers enregistre une sortie, sur toutes les surfaces |

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

## Ce que la revue a laissé ouvert, et ce qu'elle en a fait

Trois constats étaient écrits ici comme non corrigés. **Deux l'ont été dans
la foulée**, et le troisième reste ouvert délibérément.

| constat | suite |
|---|---|
| la poignée annonce toujours « Zones, traces et réglages » pendant une sortie | corrigé (#240) : elle dit « 2,4 km · 42:00 » |
| pas de témoin sur grand écran, panneau replié | corrigé (#241), et plus simplement que prévu — le bouton porte déjà la même phrase que la poignée, c'est devenu le même composant |
| la zone de dépôt descendue sous le pli sur téléphone | **laissé ouvert** |

Le dernier l'est pour une raison : faire défiler pour atteindre la deuxième
section d'un onglet est le comportement attendu. Ce qui mérite d'être
mesuré, c'est si quelqu'un cherche cette zone sans la trouver — et cela se
mesure avec une personne, pas avec un test.

**U11** (les émojis en couleur de la barre d'onglets) reste ouvert depuis
l'audit UX : c'est un choix de design, pas un défaut mesuré. Il ne se
tranche pas seul de nuit.

---

## Deux défauts trouvés après coup, en cherchant ailleurs

La revue avait regardé l'écran. Deux défauts de plus sont sortis en
regardant **ce qui existait déjà**, plutôt que ce qui venait d'être écrit.

**Démarrer une sortie n'éteignait pas la démonstration** (#242). L'issue
#172 avait posé la règle et l'import d'un fichier la respectait — « la
démonstration s'efface au premier vrai fichier ». Démarrer une sortie est
plus réel encore, et laissait pourtant une vraie trace se ranger à côté de
trois sorties fictives, pendant qu'un bandeau affirmait que rien n'était
enregistré. Le défaut que #172 avait fermé, rouvert par une porte que
personne n'avait pensé à fermer — parce qu'elle n'existait pas encore.

**Cinq surfaces publiques décrivaient un produit qui ne sait que lire des
fichiers** (#243). Dont « À propos », à qui manquait la seule chose qui
compte vraiment : pendant un enregistrement, la position est relevée toutes
les quelques secondes et écrite dans le navigateur. C'est la donnée la plus
sensible que l'application ait jamais manipulée, et la page qui promet que
rien ne sort ne la nommait pas.

Une fonctionnalité neuve n'a pas de diff avec les règles qu'elle enfreint :
elle ne les enfreint qu'en s'ajoutant à côté.

## Ce que ce sprint apprend

Deux nuits de suite, la revue a trouvé un défaut que la porte complète
n'avait pas vu — et deux fois pour la même raison : **la porte vérifie ce
qu'on lui a appris à vérifier.** Elle ne regarde pas l'écran.

Le remède n'est pas d'ajouter des tests au hasard mais de choisir la
deuxième configuration à la main : une autre largeur, une autre hauteur, un
autre état. Les trois défauts de cette nuit étaient tous à une frontière que
personne n'avait franchie — le téléphone, la carte pendant la marche,
l'onglet qu'on quitte.
