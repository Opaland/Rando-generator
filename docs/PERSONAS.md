# Analyse par personas — Sentiers

Écrite le 20/08/2026, en parcourant l'application telle qu'elle est, pas telle
qu'on l'imagine. Chaque constat renvoie au code qui le produit ; ce qui n'a pas
pu être vérifié est signalé comme tel.

La méthode est celle de l'audit mobile : on suit quelqu'un de précis, on note
où il s'arrête, et on ne compte comme problème que ce qu'on peut montrer.

---

## Bernard, 62 ans, retraité, Saint-Chamond

Marche deux fois par semaine dans le Pilat. GPS Garmin de 2016, un PC portable
à la maison, un téléphone Android qu'il utilise « pour les photos ». Veut
savoir combien de PR du massif il a déjà faits.

**Ce qui marche.** La zone « PNR du Pilat » est à un clic. Il dépose ses GPX,
le pourcentage monte, la carte se colore. C'est exactement la promesse, et
elle est tenue en trois gestes.

**Où il s'arrête.**

- **Ses données ne suivent pas d'un appareil à l'autre.** Tout vit dans
  l'IndexedDB du navigateur (`src/db/`). Bernard qui importe ses traces sur le
  PC ne verra rien sur le téléphone — et rien ne le lui dit. Il n'existe
  aucune sauvegarde exportable : on peut exporter *un* itinéraire en GPX
  (`core/gpxExport`) et le bilan en image, jamais l'ensemble de ses traces.
  C'est le prix du « rien ne quitte votre navigateur », mais le prix doit être
  annoncé, et une sauvegarde manuelle le rendrait supportable.
- **Vider le cache du navigateur efface tout.** Même remarque, même silence.

## Sylvie, 29 ans, débute la randonnée, téléphone uniquement

A marché trois fois cette année. Ne sait pas ce qu'est un GR. Cherche
« des balades autour de Saint-Étienne ».

**Où elle s'arrête, dès la première vue.**

- **On ne peut pas chercher un lieu.** Le sélecteur propose des départements,
  trois zones et six grands itinéraires ; le champ libre attend une *ref*
  (« GR 7 »), pas un nom de commune (`ZONES` dans `core/overpass.ts`). Sylvie
  ne connaît ni sa ref ni son département de rattachement — elle connaît sa
  ville. C'est le premier écran, et il parle une langue qu'elle n'a pas.
- **Le vocabulaire est celui du milieu.** « GR », « GRP », « PR », « ref »,
  « tolérance de matching » : rien n'est faux, tout suppose acquis. La page
  « À propos » explique les balisages, mais après coup.
- **Sans trace GPX, l'application ne lui sert à rien.** Elle n'en a pas : ses
  sorties sont dans sa tête. Or Sentiers ne sait pas cocher un itinéraire à la
  main — il n'y a pas de « j'ai fait celui-là ».

## Camille, 34 ans, prépare la Grande Traversée des Alpes

Trois semaines de marche l'été prochain. Veut découper, repérer les refuges,
savoir où boire.

**Ce qui marche, et qui la distingue des concurrents.** Le découpage en
étapes calculées (`core/stages`), les cols et sommets nommés sous le profil,
le détour de chaque point d'intérêt, la potabilité annoncée quand OSM la
connaît. Sur ces quatre points, l'application dit ce qu'elle sait et ce
qu'elle ignore — c'est rare.

**Où elle s'arrête.**

- **Rien ne fonctionne hors connexion pour préparer.** Le profil altimétrique
  (service IGN) et les points d'intérêt (Overpass) ne sont pas mis en cache,
  volontairement (README) : périmés, ils vaudraient moins qu'un message clair.
  Mais Camille prépare le soir au refuge, sans réseau. Le choix est défendable,
  la conséquence est réelle.
- **Les étapes ne se déplacent pas.** Le découpage est régulier, calculé, et
  c'est dit ; il ne tient pas compte des refuges, qui sont pourtant ce qui
  décide d'une étape en montagne.
- **Aucun export de son plan.** Elle ne peut pas emporter le découpage dans sa
  montre : seul l'itinéraire complet s'exporte en GPX, pas les étapes.

## Karim, 41 ans, rentre de sortie, montre Garmin

Ouvre l'application le dimanche soir avec l'export de sa montre.

**Ce qui marche.** GPX, FIT, TCX et l'archive ZIP complète de Strava ou Garmin
s'importent sans rien envoyer nulle part — c'est le point fort du produit face
aux connecteurs OAuth.

**Où il s'arrête.**

- **Une archive de plusieurs centaines d'activités n'a pas été mesurée.** Le
  développement s'est fait sur des archives synthétiques de quelques fichiers.
  Le parsing est séquentiel avec une pause par fichier ; sur 800 activités, le
  temps total est inconnu — et le quota IndexedDB aussi. À mesurer avant de
  promettre quoi que ce soit.
- **Ses sorties hors zone chargée ne comptent pas.** Le pourcentage porte sur
  les itinéraires de la zone téléchargée : une sortie en Bretagne n'apparaît
  nulle part tant qu'il n'a pas chargé la Bretagne. L'historique la compte en
  kilomètres, le tableau de bord l'ignore. Rien n'explique cet écart.

## Marc, 55 ans, baliseur bénévole

Connaît le terrain mieux qu'OpenStreetMap. Veut voir ce qui manque.

**Ce qui marche, et personne d'autre ne le fait.** Les relations trouées sont
signalées, le nombre de morceaux et les kilomètres d'interruption sont donnés,
la date de dernière modification OSM est affichée. Sentiers dit la qualité de
sa donnée au lieu de la maquiller.

**Où il s'arrête.**

- **Le constat ne mène à aucune action.** Marc voit qu'il manque 12 km à une
  relation ; il n'a aucun lien vers l'objet OSM pour aller le corriger. Un lien
  « ouvrir dans l'éditeur OSM » transformerait un signalement en contribution.

## Léa, 38 ans, chargée de mission dans une collectivité

Son département vient d'ouvrir son PDIPR. Veut voir ce que ça donne.

**Ce qui marche.** Le GeoJSON s'importe, chaque sentier devient un itinéraire.

**Où elle s'arrête.**

- **Sa couche arrive dans « Mes itinéraires ».** Elle n'est pas distinguée
  comme source institutionnelle, et ne porte pas l'attribution du producteur —
  alors que c'est une obligation de la Licence Ouverte, et que le mécanisme
  existe déjà pour les boucles de la Métropole (réseau `LOCAL`). L'écart est
  assumé mais il devra se combler (issue #87).

---

## Ce que ces six parcours ont en commun

Trois manques reviennent chez plusieurs personas, et ce sont eux qui méritent
d'être traités avant le reste :

1. **On ne peut pas chercher un lieu.** Sylvie s'arrête là ; Bernard et Karim
   s'en sortent parce qu'ils connaissent leur département.
2. **Rien ne se sauvegarde ni ne se transfère.** Bernard et Karim perdent tout
   en changeant d'appareil ou en vidant leur cache, sans avertissement.
3. **Ce qui n'est pas dans la zone chargée n'existe pas** pour le tableau de
   bord, alors que l'historique, lui, le compte. Deux chiffres, deux
   périmètres, aucune explication.

Le reste — étapes déplaçables, export du plan, lien vers l'éditeur OSM,
attribution des couches importées — relève de l'approfondissement, pas du
blocage.
