# Architecture — Sentiers

*Troisième des trois documents demandés par l'issue #94. Écrit le 20/08/2026.*

Ce document ne décrit pas l'arborescence — `ls` le fait mieux. Il consigne les
**décisions structurantes et leurs raisons**, celles qu'on regrette d'avoir
oubliées six mois plus tard.

---

## D1 — Aucun backend

**Décision.** Tout s'exécute dans le navigateur. Le site est un ensemble de
fichiers statiques servis par GitHub Pages.

**Pourquoi.** Les traces GPS sont des données de localisation personnelle :
elles disent où quelqu'un habite et à quelle heure il court. Ne pas les
collecter est plus solide que promettre de bien les garder. Accessoirement,
un produit sans serveur ne coûte rien à faire vivre — ce qui compte pour un
projet qui n'a pas de modèle économique.

**Ce que ça coûte.** Rien ne suit d'un appareil à l'autre ; vider les données
du site efface tout. Le prix est **annoncé** et une sauvegarde manuelle le
rend supportable (`src/core/backup.ts`). C'est un coût assumé, pas un oubli.

**Ce qui l'annulerait.** Rien de ce qui a été envisagé jusqu'ici. Une
synchronisation multi-appareils sans serveur reste possible (fichier échangé
par l'utilisateur) ; avec serveur, ce serait un autre produit.

---

## D2 — `src/core` est pur, et c'est là qu'est le test

**Décision.** Tout le calcul vit dans `src/core/*.ts` : fonctions pures, sans
DOM, sans réseau, sans `Date.now()` caché. Le seuil de couverture (≥ 90 %) ne
porte que sur ce répertoire.

**Pourquoi.** C'est la partie dont la justesse se démontre. Un test de bout en
bout dit qu'un pourcentage s'affiche ; un test unitaire dit qu'il vaut 43,2 %
et pourquoi. La règle a une conséquence utile : quand un comportement est
difficile à tester, c'est presque toujours qu'il est au mauvais endroit.

**Exemple récent.** L'infobulle des points d'intérêt vivait dans `MapView` ;
elle assemble du HTML à partir de noms OpenStreetMap, donc de chaînes écrites
par des inconnus. Sortie en fonction pure, elle a gagné le test qui montre
qu'un nom malveillant s'affiche au lieu de s'exécuter.

---

## D3 — Un seul store, et des compteurs de séquence

**Décision.** Un magasin Zustand unique (`src/store/appStore.ts`). Les
opérations longues et concurrentes (chargement de zone, recherche de lieu,
fiche détail) sont protégées par un compteur : la réponse d'une opération
périmée est calculée mais **jamais appliquée à l'interface**.

**Pourquoi.** Overpass met de trente secondes à deux minutes. L'utilisateur
clique une autre zone entre-temps. Sans compteur, la première réponse écrase
la seconde et affiche des tracés que personne n'a demandés.

**Détail qui a coûté cher.** La base IndexedDB doit être **relue à chaque
usage**, jamais capturée à l'entrée d'une fonction asynchrone : au démarrage,
un `db` figé à `null` valait encore `null` deux minutes plus tard, et la zone
n'était jamais mise en cache.

---

## D4 — Les échantillons tous les 100 m, calculés une fois

**Décision.** Chaque itinéraire est échantillonné tous les 100 mètres
(`STEP_METERS`). Un échantillon porte la liste des itinéraires qui passent
par son *way* : un tronçon partagé compte pour chacun d'eux, sans être
mesuré plusieurs fois.

**Pourquoi.** Cette structure unique sert le pourcentage, la coloration de la
carte, les tronçons restants, la suggestion de prochaine sortie et la plus
longue série continue. Ces fonctionnalités n'ont rien coûté en calcul parce
qu'elles relisent la même liste.

**Ce que ça coûte.** Un aller-retour de moins de 100 m est invisible. C'est un
compromis assumé : descendre la résolution multiplierait le coût de tout le
reste.

---

## D5 — Le matching mesure des segments, pas des points

**Décision.** Un échantillon est « parcouru » si une trace passe près du
**segment** GPS, avec une exigence de continuité minimale et une confirmation
de proximité franche.

**Pourquoi.** La version naïve (distance au point GPS le plus proche)
créditait une route parallèle à 30 mètres, une traversée perpendiculaire, et
ne créditait pas un GPS qui n'enregistre qu'un point tous les 500 mètres.
Chacun de ces trois cas est figé dans `tests/unit/matchingQuality.test.ts`
avec le chiffre avant et après.

**Règle qui en découle** : aucun changement du matching sans un test montrant
son effet chiffré sur ces cas.

---

## D6 — Formats lus à la signature, jamais à l'extension

**Décision.** GPX, FIT, TCX, GeoJSON, ZIP, gzip : le contenu décide, pas le
nom du fichier.

**Pourquoi.** Une montre exporte `activity.fit` renommé en `.gpx` par un
utilitaire ; une archive Strava contient des `.gpx.gz`. Refuser un fichier
lisible parce que son nom ment est une frustration gratuite.

**Conséquence.** Le lecteur ZIP et le lecteur GeoJSON sont écrits à la main
(`src/core/zip.ts`, `src/core/geojson.ts`) : lire l'annuaire central d'un ZIP
tient en cent lignes et évite une dépendance de plus dans une application qui
en compte peu.

---

## D7 — Chaque appel réseau peut échouer, et le dit

**Décision.** Overpass (avec ses miroirs), le service altimétrique IGN, les
tuiles, la BAN : chacun a un repli et un message qui nomme la panne et
propose une suite.

**Pourquoi.** Ce sont des services publics gratuits, régulièrement saturés.
Un écran vide fait conclure que l'application est cassée ; un message qui dit
« les serveurs OpenStreetMap sont injoignables, voici vos tracés en cache »
laisse l'utilisateur travailler.

**Règle** : « introuvable » et « en panne » ne partagent jamais le même
message. Les confondre fait chercher une faute de frappe pendant que le
service est down.

---

## D8 — Une donnée absente se dit, elle ne se devine pas

**Décision.** Quand OpenStreetMap se tait, l'interface le dit : « potabilité
non renseignée », « altitude inconnue », « tracé incomplet dans
OpenStreetMap ».

**Pourquoi.** Le produit vend un chiffre. Sa crédibilité tient à ce qu'il
n'invente rien — y compris quand inventer serait plus joli. Une source
présentée comme un point d'eau potable, c'est un randonneur malade.

**Corollaire de développement** : ne pas coder contre un schéma supposé. Le
facteur de conversion du `hdop` (#95) attend des traces réelles ; les
intégrations PDIPR (#87) attendent des sources joignables. Un lecteur
générique qui marche vaut mieux qu'un connecteur écrit contre une
supposition.

---

## D9 — La carte se lit en quatre hooks

**Décision.** `MapView` orchestre ; les hooks portent : `useMapInstance`
(création, repli du fond de carte), `useMapInteractions` (clics, infobulles),
`useMapSources` (données), `useMapCamera` (cadrage).

**Pourquoi.** Un effet de cent vingt lignes mêlant création, repli de tuiles,
clics et infobulles ne se relit pas, donc ne se modifie pas sans risque.

**Ce qui garantit le découpage.** Les tests e2e exercent chaque
responsabilité déplacée : ouverture d'une fiche au clic, infobulle de POI,
bascule sur les tuiles OSM quand l'IGN tombe.

---

## D10 — Le français, partout

**Décision.** Interface, messages d'erreur, commentaires, noms de variables
dans le code récent, messages de commit, tests.

**Pourquoi.** Le produit s'adresse à des randonneurs français à propos de
sentiers français, avec des données françaises. Un message d'erreur qui
bascule en anglais au pire moment est une fuite d'implémentation.

---

## Ce qui n'est pas décidé

- **Tuiles vectorielles** (#93) : le chantier a un coût réel et un bénéfice
  non mesuré. À instruire avec des chiffres avant de s'y engager.
- **Web Worker pour le parsing** : mesuré à ~320 ms pour un GPX de 9 Mo, donc
  non justifié aujourd'hui. À rouvrir si un fichier réel gèle l'interface
  plus d'une seconde.
