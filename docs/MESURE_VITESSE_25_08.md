# Ce que six randonnées réelles disent de la vitesse

Cédric a déposé le 25/08 le corpus que #150 attendait depuis le 20 : **six
sorties, chacune en FIT (le fichier natif de la montre) et en GPX (l'export
Strava)**, plus une sortie Suunto en trace et en itinéraire.

Quatorze fichiers, **81,4 km, 21 h de marche**, entre octobre 2021 et
décembre 2025.

Ce document ne propose pas de seuil. Il dit ce que la donnée montre — et la
première chose qu'elle montre n'était pas celle qu'on cherchait.

---

## 1. La mesure

Vitesse calculée entre deux points horodatés, agrégée sur des fenêtres de
durée croissante. Les parseurs sont ceux de l'application (`src/core/gpx.ts`,
`src/core/fit.ts`), pas un lecteur écrit pour l'occasion : mesurer avec un
autre outil que celui qui tranchera aurait mesuré autre chose.

### Le maximum observé sur tout le corpus, par fenêtre

| fenêtre | vitesse maximale | en km/h |
|---|---|---|
| **instantanée** (0 s) | **93,18 m/s** | 335 |
| 5 s | 18,64 m/s | 67 |
| 15 s | 6,21 m/s | 22 |
| 30 s | 4,21 m/s | 15 |
| **60 s** | **2,62 m/s** | **9,4** |

Toutes ces lignes décrivent **les mêmes vingt-et-une heures de marche**. La
première dit 335 km/h.

---

## 2. La trouvaille : le format change la vitesse d'un facteur vingt

La même sortie, le même jour, la même montre — deux fichiers :

| Afternoon_Hike, 10/04/2024 | points | cadence | max instantané |
|---|---|---|---|
| `.fit` (natif) | 717 | 15,7 s | **4,91 m/s** |
| `.gpx` (export Strava) | 10 287 | 1,1 s | **93,18 m/s** |

Et la cause, comptée sur les fichiers plutôt que supposée — les paires de
points consécutifs **strictement identiques** (mêmes lat/lon) :

| fichier GPX | points | paires identiques |
|---|---|---|
| Afternoon_Hike | 10 287 | 693 (6 %) |
| Afternoon_Hike_1 | 9 038 | 4 785 (**52 %**) |
| Afternoon_Hike_2 | 10 009 | 5 576 (**55 %**) |
| Lunch_Hike | 13 982 | 8 584 (**61 %**) |
| Lunch_Hike_1 | 15 370 | 8 629 (**56 %**) |
| Morning_Hike | 13 240 | 7 703 (**58 %**) |
| suuntoapp…track | 5 316 | **0** |

Une montre enregistre à cadence variable (« smart recording ») ; l'export
Strava rééchantillonne à 1 Hz. Plus de la moitié des points ainsi produits
**ne bougent pas** — et toute la distance se reporte sur ceux qui bougent, en
doublant leur vitesse apparente. Le fichier Suunto, exporté sans
rééchantillonnage, n'a aucune paire identique.

**Conséquence pour #150 :** un seuil de vitesse appliqué point à point ne
mesure pas la marche, il mesure **le format d'export**. Il couperait une
sortie Strava et laisserait passer la même sortie en FIT.

---

## 3. Ce que le corpus établit, et ce qu'il n'établit pas

**Établi :**

- sur une fenêtre d'**une minute**, aucune des six randonnées ne dépasse
  **2,62 m/s** (9,4 km/h) — ni en FIT, ni en GPX ;
- la médiane est remarquablement stable d'une sortie à l'autre : **1,17 à
  1,29 m/s** (4,2 à 4,6 km/h) sur les six, quinze ans d'écart de matériel
  compris ;
- la fenêtre est ce qui fait converger les deux formats : à 60 s, l'écart
  FIT/GPX d'une même sortie tombe sous 10 %.

**Non établi, et le §2 interdit de faire comme si :**

- **la course à pied n'est pas dans ce corpus.** Six randonnées ne disent rien
  d'un traileur en descente, et un seuil calé sur 2,62 m/s amputerait de
  vraies sorties. Le seuil devra donc être fixé au-dessus de ce que le corpus
  mesure, et la marge ne se prend pas ici ;
- **le vélo et la voiture non plus.** On sait ce qu'une marche fait ; on
  n'a pas mesuré ce qu'un trajet en voiture le long d'un sentier donne sur
  ce même calcul.

---

## 4. Ce qui reste à décider, et sur quoi

1. **La fenêtre** : 60 s est la première qui rende les deux formats d'accord.
   30 s laisse encore passer 4,21 m/s sur une marche. C'est la donnée qui
   tranche, et elle tranche pour 60.
2. **Le seuil** : au-dessus de 2,62 m/s, en dessous d'un véhicule. L'écart est
   large, et le remplir demande soit une trace de course, soit une référence
   publiée — un record d'athlétisme est un nombre emprunté, pas inventé
   (§6sexies), et c'est probablement la piste la plus honnête à ce stade.
3. **Ce qu'on fait du segment coupé** : l'écarter du matching, ou couper la
   trace en deux ? Les deux n'ont pas le même effet sur le pourcentage.

---

## 5. Ce que ça change pour les tests `LIMITE`

`tests/unit/matchingMission.test.ts` porte deux tests annotés `LIMITE` qui
passent en documentant la faille. L'un s'appelle :

> `LIMITE : sans horodatage conservé, un trajet en voiture est crédité`

Son titre est **périmé depuis #149** : l'horodatage est conservé, dans les
trois parseurs. Ce n'est plus la donnée qui manque, c'est la règle — et ce
document est la moitié de ce qu'il fallait pour l'écrire.
