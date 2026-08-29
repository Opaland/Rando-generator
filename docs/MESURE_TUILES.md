# Ce que pèse un corridor de tuiles IGN

Mesure du 29/08, reproductible par `npm run poids-tuiles`
(`scripts/poids-tuiles.mjs`). Elle produit le nombre que `src/core/telechargement.ts`
réclamait en toutes lettres depuis #153 :

> Ce qu'il faudrait pour trancher mieux : le poids réel d'une tuile IGN sur
> un secteur de montagne.

Faute de ce nombre, `src/components/BoutonEmporter.tsx` affiche un **compte de
tuiles** et non des mégaoctets — annoncer « environ 40 Mo » aurait été le
nombre inventé que le §2 interdit. Ce document ne change pas ce que le bouton
affiche : c'est une décision de rédaction, et elle appartient à **#397**.

## Comment la mesure est prise

Les tuiles pesées sont **exactement celles que le bouton téléchargerait** : le
script appelle `tuilesDuCorridor`, avec `ZOOMS_TERRAIN` et
`RAYON_CORRIDOR_METRES`, et compose ses adresses avec `urlDeTuile` et
`IGN_TILES`. Recalculer un corridor à côté aurait été un deuxième calcul de la
même grandeur — le défaut du §4ter, mesuré à trois exemplaires sur #303.

La trace de référence est une boucle que le dépôt porte déjà, « Les Vallons de
la Beffe » (`gid` 5 de `tests/fixtures/boucles/metropole.json`). Douze tuiles
par zoom sont tirées au sort, avec une graine fixe : deux exécutions
interrogent les mêmes tuiles.

## Les chiffres

### Là où la trace est — Métropole de Lyon

| zoom | tuiles | pesées | moyenne | écart-type |     min |     max |   total |
|-----:|-------:|-------:|--------:|-----------:|--------:|--------:|--------:|
|   12 |      9 |      9 |  78 541 |     11 198 |  54 530 |  93 289 |  690 ko |
|   13 |      9 |      9 |  87 013 |     10 129 |  74 953 | 106 769 |  764 ko |
|   14 |      9 |      9 |  96 539 |      7 268 |  80 514 | 107 573 |  848 ko |
|   15 |     12 |     12 |  73 093 |      7 971 |  55 054 |  84 919 |  856 ko |
|   16 |     30 |     12 |  53 707 |      7 279 |  40 404 |  62 929 |  1,5 Mo |

**69 tuiles, 4,6 Mo.**

### La même trace, translatée en Chartreuse

| zoom | tuiles | pesées | moyenne | écart-type |     min |     max |   total |
|-----:|-------:|-------:|--------:|-----------:|--------:|--------:|--------:|
|   12 |      9 |      9 |  89 838 |      8 256 |  74 996 | 100 944 |  789 ko |
|   13 |      9 |      9 | 105 422 |      6 192 |  96 751 | 115 876 |  926 ko |
|   14 |      9 |      9 |  86 804 |      9 841 |  67 291 | 101 345 |  762 ko |
|   15 |      9 |      9 |  54 375 |      7 904 |  45 180 |  68 271 |  477 ko |
|   16 |     30 |     12 |  29 453 |      5 495 |  22 049 |  41 625 |  862 ko |

**66 tuiles, 3,7 Mo.**

## Ce que ça dit

**Un corridor de 500 m sur une boucle de village pèse de l'ordre de quatre
mégaoctets.** C'est un ordre de grandeur, pas un chiffre : les tuiles d'un même
zoom vont du simple au double, et le total est une somme de moyennes
échantillonnées.

**« La montagne coûte plus cher » est faux tel quel.** L'écart change de signe
avec le zoom :

| zoom |  ville | montagne | écart |
|-----:|-------:|---------:|------:|
|   12 | 78 541 |   89 838 | +14 % |
|   13 | 87 013 |  105 422 | +21 % |
|   14 | 96 539 |   86 804 | −10 % |
|   15 | 73 093 |   54 375 | −26 % |
|   16 | 53 707 |   29 453 | **−45 %** |

Aux zooms d'ensemble, la montagne est plus lourde — le relief est dessiné,
courbes de niveau et estompage, là où la plaine est unie. Aux zooms où l'on lit
un sentier, elle est **beaucoup plus légère** : une tuile de ville à 1:8 000
porte des rues, des numéros, des noms de commerces ; une tuile de forêt porte
un layon et une courbe.

C'est l'inverse de ce que j'aurais parié, et c'est le genre de chose qu'une
moyenne sur tous les zooms cache : moyennés à poids égal, les cinq zooms
donnent « la montagne coûte 11 % de plus », ce qui n'est vrai à aucun zoom.

**Le poids ne croît pas avec le zoom.** Il culmine à 13–14 et redescend
ensuite : une tuile z16 de Chartreuse pèse 3,6 fois moins qu'une z13. Le
corridor coûte donc **moins** cher que ne le suggérerait « trente tuiles au
zoom le plus fin ».

## Ce que ça ne dit pas

- **Un échantillon n'est pas un inventaire.** Douze tuiles par zoom donnent une
  moyenne à quelques pour cent près, pas un total exact.
- **Une translation n'est pas une randonnée.** La trace déplacée en Chartreuse
  traverse ce qu'elle traverse ; elle sert à peser un sol, pas à décrire un
  parcours. Et les deux corridors n'ont pas le même nombre de tuiles — 69
  contre 66 — parce que la latitude change la largeur d'une tuile en mètres,
  donc le débordement du corridor. **Les deux totaux ne se comparent pas
  entre eux** ; seules les moyennes par zoom le font.
- **Une boucle de village n'est pas un GR.** Cinq points, quelques kilomètres.
  Un itinéraire de deux cents kilomètres compte des milliers de tuiles, et le
  §2 interdit d'extrapoler linéairement sans l'avoir vérifié : un tracé
  sinueux repasse sur ses propres tuiles, un tracé rectiligne non.
- **Rien ici ne dit ce que le navigateur garde.** Le cache a sa propre
  éviction, et une tuile déjà vue ne se retéléchargera pas.
- **Le profil altimétrique n'est pas pesé.** Il est demandé en une requête, il
  ne dépend pas du zoom, et il se compte à part.

## Ce qui a changé dans le code

Rien de ce que voit un utilisateur. Trois commentaires disaient « personne n'a
mesuré ce que pèse une tuile de la Géoplateforme » ; c'était vrai jusqu'à
aujourd'hui, et le §4bis veut qu'une justification qui vieillit soit relue.
Ils renvoient maintenant ici, en disant que **ce qui s'affiche reste un compte
de tuiles tant que #397 n'a pas tranché** — parce que passer du chiffre mesuré
à un chiffre affiché n'est pas une mesure, c'est une décision.
