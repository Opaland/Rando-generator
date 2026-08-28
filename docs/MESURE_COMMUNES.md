# Ce que pèserait un découpage communal embarqué

Mesure du 28/08, reproductible par `npm run poids-communes`
(`scripts/poids-communes.mjs`). Elle répond à la question que l'issue #296
posait avant de décider quoi que ce soit :

> combien pèsent 34 945 communes simplifiées à la tolérance qui garde un
> point-dans-polygone juste ?

## Les chiffres

Source : `communes.geojson` de `france-geojson`, **géométrie vraie** — 35 228
communes, 2 168 123 sommets.

|   tolérance |  ≈ mètres |   brut |   gzip |   sommets | désaccord |
|------------:|----------:|-------:|-------:|----------:|-----------|
| aucune      |         — | 45,3 M | 12,2 M | 2 168 123 | référence |
| 0,0001      |      11 m | 44,3 M | 11,7 M | 2 155 497 | 0/400 (0,0 %) |
| 0,0003      |      33 m | 41,4 M | 10,9 M | 2 003 561 | 1/400 (0,3 %) |
| 0,0010      |     111 m | 24,5 M |  6,1 M | 1 112 075 | 7/400 (1,8 %) |
| 0,0030      |     333 m | 12,6 M |  2,9 M |   486 872 | 27/400 (6,8 %) |

Le « désaccord » est la part de points de contrôle que le fichier simplifié
range dans une **autre** commune que le fichier de pleine précision. Les
points sont tirés au hasard à l'intérieur d'une commune, et la vérité de
référence est le fichier non simplifié : la mesure est close, elle ne dépend
d'aucune source extérieure.

## Ce que ça dit

**Il n'existe pas de tolérance à la fois assez légère pour être embarquée et
assez juste pour être crue.** Garder le point-dans-polygone intact coûte
11,7 Mo gzippés — trente fois le poids actuel du bundle. Descendre à 2,9 Mo
se paie de près de sept pour cent de réponses fausses, sur une fonction dont
tout l'intérêt est de nommer le bon endroit.

## L'autre forme, qui ne promet pas la même chose

Une table `nom + centre` des mêmes 35 228 communes pèse **0,44 Mo gzippé**,
soit vingt-six fois moins que la version polygonale utilisable.

Elle ne répond pas à « dans quelle commune ce point est-il ? » mais à
« quelle commune est la plus proche ? ». Près d'une limite, ou dans une
commune étendue, ce n'est pas la même réponse — et ce serait un chiffre
présenté comme une mesure alors qu'il n'en est pas une (§2) si l'interface
laissait croire au contenant.

## Ce que la mesure ne dit pas

- La simplification est un Douglas–Peucker **anneau par anneau**, sans
  préservation de topologie : deux communes voisines peuvent se chevaucher ou
  laisser un interstice. Un outil topologique (TopoJSON, mapshaper) ferait
  mieux à tolérance égale. Les taux ci-dessus sont donc un **plancher de
  qualité**, pas un plafond — un vrai chantier obtiendrait des chiffres
  meilleurs, pas pires.
- Le tirage est uniforme dans la boîte englobante de chaque commune : il
  sur-représente les communes étendues, et ne dit rien de la distribution
  réelle des départs de randonnée.
- Quatre cents points de contrôle. À 0,3 %, l'incertitude d'échantillonnage
  est du même ordre que la valeur ; deux exécutions avec des graines
  différentes ont rendu 1/400 et 2/400 à 33 m, 27/400 et 22/400 à 333 m. Les
  ordres de grandeur tiennent, les décimales non.

## Un piège écarté au passage

Le jeu de données le plus visible sur data.gouv.fr — « Contours des communes
de France simplifié » — existe **uniquement** en version « Droms rapprochés » :
les départements d'outre-mer y sont **déplacés** pour tenir sur une carte de
France. Une sortie en Guadeloupe y tomberait dans une commune métropolitaine.
C'est un excellent fond de carte et une source inutilisable pour un
point-dans-polygone.
