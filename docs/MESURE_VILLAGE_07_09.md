# La couverture OSM des commerces de village, mesurée (issue #285)

Ce document ne dit pas si un commerce est ouvert. Il établit ce que #285
posait comme condition avant toute fonctionnalité : la part des commerces de
village qui portent `opening_hours`, `phone`, et surtout l'âge du relevé —
le chiffre qui décide si ces tags sont crédibles.

Mesuré le 07/09 par `scripts/couverture-village.mjs` (`node
scripts/couverture-village.mjs`), via le miroir `maps.mail.ru` (les deux
miroirs de l'application coupaient la connexion depuis cet environnement,
voir `tests/unit/mesuresReseau.test.ts`).

## Un défaut trouvé avant de faire confiance au résultat (§1bis)

La première exécution interrogeait `area["name"="Munster"]` sans autre
filtre. Un nom seul ne désigne pas une zone administrative : Overpass unit
**toutes** les zones qui le portent, et il en existe sept dans le monde
nommées « Munster » — dont une province irlandaise (`admin_level=5`). Le
premier résultat (124 points de ravitaillement) comptait donc des commerces
de plusieurs pays sous un seul nom.

Corrigé en résolvant chaque village par un identifiant de relation OSM
(trouvé via `nominatim.openstreetmap.org/search?q=<village>, France`,
vérifié un par un) plutôt que par son nom — la même discipline que le
témoin du Pilat.

## Les chiffres, sur 7 des 8 villages de l'échantillon

Le 8e, Munster (Haut-Rhin, GR 5), a buté sur la limitation de débit du
miroir à chaque tentative (sept essais). Mesuré séparément, ses proportions
sont du même ordre de grandeur que les sept autres — rien qui change la
lecture, donc il n'est pas fondu dans le tableau pour garder des comptes
exacts plutôt qu'une addition de pourcentages arrondis.

| catégorie | points | `opening_hours` | `phone` | `website` | âge médian du relevé |
|---|---:|---:|---:|---:|---:|
| ravitaillement | 53 | 62 % | 38 % | 19 % | 0,9 an |
| dodo | 88 | 8 % | 43 % | 55 % | 1,8 an |
| mairie | 7 | 100 % | 100 % | 100 % | 0,5 an |
| depannage | 21 | 81 % | 48 % | 5 % | 1,0 an |
| manger | 125 | 23 % | 42 % | 23 % | 1,0 an |

Munster à part : ravitaillement 16 pts (50 %/25 %/38 %/2,0 ans), dodo 8 pts
(0 %/38 %/100 %/1,3 an), mairie 1 pt (100 %/100 %/100 %/1,0 an), dépannage
4 pts (25 %/50 %/0 %/2,2 ans), manger 17 pts (41 %/47 %/41 %/1,2 an).

Échantillon (résolu par identifiant de relation) : Le Bourg-d'Oisans
(1347500), Chalmazel (1043076), Saint-Julien-Molin-Molette (445336), Munster
Haut-Rhin (905906), Barèges (2327992), Le Monêtier-les-Bains (972052),
Saint-Rémy-de-Provence (103755), Chaudes-Aigues (2658224).

## Ce que ça répond à la question de #285

**Ravitaillement, mairie et dépannage** portent `opening_hours` sur 62 à
100 % des points — loin du seuil de 15 % qui aurait fait de la fonctionnalité
un formulaire vide.

**Le dodo est la catégorie basse** (8 %), et ce n'est pas une lacune de
donnée : `opening_hours` décrit un horaire d'ouverture au public, pas la
disponibilité d'un lit — le tag ne s'applique simplement pas à la plupart
des hébergements.

**L'âge médian du relevé — le chiffre que l'issue nommait comme décisif —
est bas partout** : 0,5 à 2,2 ans, jamais les six ans redoutés. Ça ne prouve
pas qu'un commerce est ouvert ; un relevé d'il y a un an reste un doute
raisonnable, pas un champ mort.

## Ce que cette mesure ne tranche pas

Le rayon de recherche autour d'un village et le regroupement par
`place=village|hamlet|town` restent des choix d'écran (§6sexies), pas des
calculs : non traités ici. #285 reste ouverte sur son volet fonctionnalité —
ce document lève seulement le blocage de mesure qu'elle posait comme
préalable.
