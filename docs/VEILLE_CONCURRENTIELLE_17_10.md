# Veille concurrentielle — relevé du 17/10

Phase D du plan agentique (`docs/PLAN_AGENTIQUE_16_10.md`). Demande d'origine de
Cédric, 16/10 : « tu rechercheras sur le web et dans les dépôts github gitlab
si une application existe déjà ou proche (rando ? ski ? vélo ?) et tu
prendras les meilleures idées pour l'application courante. »

`docs/CONCURRENTS_27_08.md` couvre déjà cinq concurrents côté
randonnée/multi-sport (Wandrer, Visorando, HiiKER, AllTrails, Komoot), lus sur
leurs pages d'accueil. **Ce document ne les refait pas.** Il comble trois
trous que le premier relevé ne pouvait pas couvrir, puisqu'il ne les
cherchait pas :

1. l'angle **ski**, absent du premier relevé ;
2. l'angle **vélo**, au-delà de ce que Wandrer en dit déjà (« hike or ride
   every road ») ;
3. des **projets open source** (GitHub/GitLab) proches de Sentiers dans
   l'esprit — suivi local, sans compte ni serveur — que le premier relevé,
   centré sur des produits commerciaux, n'allait pas chercher.

Même méthode que le 27/08 : pages officielles et dépôts lus directement,
citations exactes, datées du 17/10. Chaque proposition est vérifiée contre
`FEUILLE_DE_ROUTE.md` → « Ce qu'on ne fera pas » avant d'être retenue ; une
idée qui s'y heurte est gardée quand même, en le disant.

---

## Les projets couverts ici, en une ligne chacun

| | angle | ce qu'il fait | compte / serveur |
|---|---|---|---|
| **Slopes** (getslopes.com) | ski | détection auto des descentes/remontées, cartes de pistes | non précisé par la page |
| **OpenSkiMap** / **OpenSnowMap** | ski | cartes de pistes open source, données OSM | aucun, site public |
| **Club des Cent Cols** (centcols.org) | vélo | club de cyclistes ayant franchi ≥ 100 cols | connexion membre pour certains contenus |
| **COTACOL** | vélo | encyclopédie numérique de 1000 cols belges | compte Strava pour le suivi |
| **trail-progress** (GitHub) | rando (OSS) | % de progression sur un GR, calculé depuis Strava | Strava + Postgres/PostGIS |
| **Waymarked Trails** (GitHub) | rando/vélo/VTT (OSS) | carte publique des relations OSM balisées | aucun compte, mais serveur (osgende) |
| **OpenTracks** (GitHub) | multi-sport (OSS) | enregistreur GPS Android, confidentialité totale | aucun, aucun serveur |
| **wanderer** (GitHub) | rando (OSS) | base de données de traces auto-hébergée | compte, serveur auto-hébergé |
| **FitTrackee** (GitHub) | multi-sport (OSS) | suivi d'activités auto-hébergé | compte, serveur auto-hébergé |

---

## 1. Ski — l'angle demandé, absent du premier relevé

### Slopes — le plus abouti, mais muet sur la complétion

Page d'accueil, relevée le 17/10 :

> Slopes never sells your data.

Et, sur le fonctionnement hors connexion :

> no cell reception required

Un avis d'utilisateur cité sur la page dit que l'app « tracks the trails
you've hit ». Mais **rien sur la page ne parle d'un pourcentage du domaine
skié**, ni de compte obligatoire ou non — la page ne le précise pas.

**Ce que ça confirme pour Sentiers :** l'enregistrement continu en haute
précision, sans réseau cellulaire, est un problème déjà résolu ailleurs
sur un terrain plus hostile (altitude, froid, GPS en vallée encaissée) —
ça ne change rien à `recorder.ts`, mais ça dit que le défi de #152 n'a rien
d'original.

**Cherché et non trouvé, à le dire honnêtement plutôt que de remplir la
case :** aucune application de ski affichant « X % des pistes du domaine
skiées » — l'équivalent ski du Wandrer déjà noté le 27/08 pour la route.
Les recherches menées (Slopes, Ski Tracker & Snow Forecast, SkiPal, Ski
Resort 3D, We Ski & Snowboard Tracker) comptent des descentes, des jours,
un dénivelé cumulé — jamais une part d'un réseau fixe. Si une telle
application existe, elle n'est pas sortie dans les recherches menées ce
jour.

### OpenSkiMap et OpenSnowMap — l'angle open source du ski

OpenSkiMap, README du dépôt `russellporter/openskimap.org`, lu le 17/10 :

> This repo contains the front end source code for OpenSkiMap.org.

Licence Apache-2.0. Le pipeline de données associé décrit son entrée comme
« OpenStreetMap data and Skimap.org Ski Areas ».

OpenSnowMap, page d'accueil, lue le 17/10 :

> The map on OpenSnowMap.org shows more than 100'000km of downhill and
> crosscountry ski pistes and ski lifts.

Avec, en pied de page, l'attribution « © OpenStreetMap.org ».

**Ce que ça apporte, sans être une fonctionnalité à reprendre :** les deux
projets prouvent que le balisage OSM que Sentiers exploite déjà pour la
randonnée (`route=hiking`) a son équivalent pour le ski (`piste:type`,
`piste:difficulty`) et que des projets 100 % publics, sans compte, tournent
dessus depuis des années. Ce n'est pas une piste à développer maintenant —
Sentiers ne fait pas de ski — mais une confirmation que l'approche « pas de
serveur de données propriétaire, on lit OSM » n'est pas propre à la
randonnée.

---

## 2. Vélo — au-delà de ce que Wandrer en dit déjà

Wandrer (« hike or ride every road ») a déjà été noté le 27/08. Ce qui suit
est nouveau.

### Club des Cent Cols — la progression sans classement, vécue depuis 1972

Page d'accueil (centcols.org), lue le 17/10. Le site revendique
explicitement l'absence de compétition :

> Loin de l'esprit de compétition

Et décrit un club rassemblant « des membres de tous horizons ». L'admission
pleine suppose d'avoir gravi au moins 100 cols différents (dont 5 au-dessus
de 2000 m) — un seuil numérique, mais qui ouvre une appartenance, pas un
rang. Une partie du site (résultats de vote de l'assemblée générale 2026)
est derrière une connexion membre ; le reste est public. Aucun outil de
suivi personnel ou de carnet numérique n'est décrit sur la page d'accueil
elle-même.

**Ce que ça confirme pour Sentiers :** c'est la preuve la plus ancienne
(54 ans) qu'un seuil numérique de progression peut exister **sans devenir
un classement entre personnes** — exactement la distinction que Sentiers
trace avec ses étoiles (« ça a compté », jamais « tu es meilleur que »).
Rien à reprendre techniquement ; une confirmation que le choix tient dans
la durée ailleurs que chez Sentiers.

### COTACOL — la version numérique, et son interrupteur Strava

Page App Store (`apps.apple.com/us/app/id1526464862`), lue le 17/10 :

> COTACOL is the digital version of the Encylopédie COTACOL

Une note de version antérieure (1.24, 2022), encore visible sur la même
page, dit :

> Please connect your Strava account to track your progress.

**Pourquoi c'est la trouvaille la plus utile de ce relevé, et pas pour ses
fonctionnalités :** COTACOL confirme, pour le vélo, exactement le même
schéma que Wandrer pour la route et que `trail-progress` ci-dessous pour la
randonnée — **le suivi de progression se fait en connectant un compte
tiers (Strava)**, dans trois sports différents, chez trois éditeurs
différents. Sentiers est la seule des approches recensées, sur trois
sports, qui ne demande ni compte ni service tiers pour savoir ce qu'on a
déjà fait. Si Sentiers proposait un jour une synchronisation équivalente,
**elle se heurterait directement à « pas de compte, pas de serveur, pas de
télémétrie »** — ce n'est donc pas une piste à retenir, seulement la
confirmation répétée que l'absence de compte est le vrai différenciateur,
plus que la qualité de l'enregistrement lui-même.

---

## 3. Projets open source proches dans l'esprit

C'est la catégorie que le premier relevé, centré sur des produits
commerciaux, ne pouvait pas trouver.

### trail-progress — le concept le plus proche de Sentiers, et sa dépendance la plus révélatrice

README du dépôt `kwoodhouse93/trail-progress`, lu le 17/10 :

> A web app for displaying stats and progress over a long distance trail
> based on a user's Strava activities.

C'est, au mot près, ce que fait Sentiers : afficher une progression sur un
itinéraire de longue distance. Mais l'architecture, décrite dans le même
README, est entièrement serveur :

> It requires a postgres database with PostGIS and a UUID extension

— avec un second dépôt (`trail-progress-worker`) qui « listen[s] for
Strava webhooks ».

**Ce que ça dit, précisément :** sur l'ensemble des recherches menées ce
jour, **la seule application dont le concept central est identique à
celui de Sentiers — un pourcentage de progression sur un sentier balisé —
n'existe qu'adossée à une base PostgreSQL/PostGIS et à un compte Strava.**
C'est la confirmation la plus directe que l'absence totale de serveur,
chez Sentiers, n'est pas un retard technique mais un choix qu'aucun
projet recensé n'a fait pour la même idée. Reprendre leur architecture (un
serveur, une synchronisation Strava) **heurterait frontalement** « pas de
compte, pas de serveur, pas de télémétrie » — à ne pas faire, et à le dire
pour que ça ne revienne pas comme une évidence technique dans un sprint
futur.

### Waymarked Trails — la même donnée OSM, pour un autre public

README du dépôt `waymarkedtrails/waymarked-trails-site` (archivé, code
scindé depuis dans `waymarkedtrails-backend/-api/-website`), lu le 17/10 :

> Waymarked Trails - Hiking, cycling, mountain biking, and inline skating

Licence :

> The source code is available under GPL. See COPYING for more
> information.

La mise à jour de sa base utilise « osgende » contre une base de données
OSM — un serveur, mais public, sans compte utilisateur.

**Ce que ça apporte :** Waymarked Trails affiche, pour les contributeurs
OSM, si une relation `route=*` est complète et bien ordonnée — un public
différent de celui de Sentiers (les mappeurs, pas les marcheurs), mais la
même matière première (les relations `route=hiking`, et leurs équivalents
`route=bicycle`/`route=mtb`). Ça confirme que le modèle de donnée que
Sentiers utilise pour la randonnée a ses équivalents publics et actifs
pour le vélo et le VTT, si la question se posait un jour d'étendre au-delà
de la marche — une décision produit qui n'est pas de notre ressort ici,
simplement notée comme possible.

### OpenTracks — le plus proche en principe, le plus pauvre en réseau

README du dépôt `OpenTracksApp/OpenTracks` (archivé le 24/08/2025, déplacé
vers Codeberg selon le même texte), lu le 17/10 :

> OpenTracks is a sport tracking application that completely respects
> your privacy.

Détaillé par quatre garanties listées dans une section « Privacy » :

> No Internet access: Internet is not used
> No advertising
> No in-app analytics
> No use of Google Play Services

Licence Apache-2.0.

**Ce que ça confirme :** c'est, de tout ce relevé, l'application la plus
proche de la philosophie de Sentiers — aucun compte, aucun serveur, aucune
télémétrie, **par construction**, et maintenue depuis des années (migration
vers Codeberg après l'archivage de GitHub, pas abandon). Elle va même plus
loin que Sentiers sur un point : elle n'a aucun accès Internet du tout, pas
même pour une carte, alors que Sentiers en a besoin pour les tuiles et
Overpass. **Rien à reprendre fonctionnellement** — OpenTracks est un simple
enregistreur, sans notion de réseau balisé ni de progression — mais c'est
une pièce utile si jamais quelqu'un met en doute que l'architecture
« zéro serveur » tienne dans la durée : elle tient, ailleurs, depuis
longtemps.

### wanderer — l'idée des listes personnalisées, détachée de sa plomberie

README du dépôt `open-wanderer/wanderer` (anciennement `Flomp/wanderer`),
lu le 17/10 :

> wanderer is a self-hosted trail database.

Fonctionnalités listées telles quelles :

> Manage your trails
> Plan new routes
> Extensive map integration and visualization
> Share trails with other people and explore theirs
> Advanced filter and search functionality
> Create custom lists to organize your trails further

Licence AGPLv3 ; installation recommandée via Docker Compose (frontend
SvelteKit, backend PocketBase, recherche Meilisearch).

**Une idée à retenir, détachée du reste :** « Create custom lists to
organize your trails further ». Transposé à Sentiers, ça donnerait la
possibilité de regrouper ses propres sorties ou itinéraires suivis dans
des listes nommées (« le GR du Pilat 2026 », « les sorties avec Théo ») —
une fonctionnalité purement locale, qui ne demande ni compte ni serveur, et
qui n'existe pas aujourd'hui dans l'historique de Sentiers. C'est une
piste, pas une décision : à poser comme issue si Cédric la retient, pas à
construire ici.

**Deux idées à ne pas reprendre, et à le dire plutôt que de les passer sous
silence :** « Share trails with other people » suppose un compte et un
serveur pour la mise en relation — heurte directement l'exclusion. Et le
modèle même du projet, « self-hosted », déplace le serveur chez la personne
au lieu de le supprimer : ce n'est pas ce que Sentiers a choisi (« pas de
serveur », pas « un serveur que vous gérez vous-même »).

### FitTrackee — le même schéma, sans idée nouvelle

README du dépôt `SamR1/FitTrackee`, lu le 17/10 :

> A simple self-hosted workout/activity tracker.

Avec la précision que les données restent « on your own server ». Licence
AGPL-3.0, cartes OpenStreetMap.

**Rien à en tirer de nouveau** : même schéma que `wanderer`, un serveur
auto-hébergé plutôt qu'un tiers, ce qui reste un serveur. Cité pour
complétude, pas pour une idée — et pour la même raison que `wanderer`, ce
modèle heurterait « pas de serveur » s'il était copié tel quel.

---

## Ce que ce relevé change pour Sentiers

**Une piste concrète, compatible avec les exclusions** : les listes
personnalisées de `wanderer`, transposées en regroupement local des sorties
— à poser comme issue si retenue, pas déjà fait.

**Trois pistes qui heurtent explicitement la liste des exclusions, et donc
écartées plutôt que silencieusement oubliées** :
1. toute synchronisation façon Strava/COTACOL/`trail-progress` — heurte
   « pas de compte, pas de serveur, pas de télémétrie » ;
2. le partage de traces entre personnes (`wanderer`) — même heurt ;
3. le modèle « auto-hébergé » (`wanderer`, FitTrackee) — heurte « pas de
   serveur », même quand le serveur appartient à la personne elle-même.

**Une confirmation répétée, pas une surprise** : sur trois sports (vélo via
COTACOL, randonnée via `trail-progress`, et déjà la route via Wandrer le
27/08), chaque application qui mesure une progression le fait en
synchronisant un compte tiers. Le choix de Sentiers de tout garder dans le
navigateur n'a d'équivalent, dans tout ce qui a été trouvé ce jour, que
chez des projets qui ne font pas de progression du tout (OpenTracks) ou qui
la font avec un serveur (`trail-progress`).

**Un trou honnêtement constaté plutôt que rempli** : aucune application de
ski mesurant une part d'un domaine skié n'a été trouvée — l'équivalent ski
de Wandrer ne semble pas exister, du moins pas dans les résultats de ce
jour.

---

## Limite de ce relevé

Comme le 27/08 : les pages produit et README lus disent ce que leurs
auteurs écrivent, pas ce que l'outil fait une fois utilisé — aucun compte
n'a été créé, aucun dépôt n'a été installé. Pour deux projets (Slopes, Club
des Cent Cols), la page publique ne dit pas explicitement si un compte est
nécessaire ; c'est signalé comme tel plutôt que supposé. Les recherches sur
un « tracker ski 100 % local » et sur un « tracker de réseau balisé sans
serveur, en dépôt GitHub/GitLab » n'ont rien trouvé de probant — ça ne
prouve pas que rien n'existe, seulement que rien de probant n'est sorti des
requêtes menées ce jour.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0154ZRyRPiim5MLBEbLCNbw3
