# PRD — Sentiers

*Deuxième des trois documents demandés par l'issue #94. Écrit le 20/08/2026.*

Ce document **hiérarchise** ; il ne recopie pas les issues. Une issue dit
comment faire une chose ; ce PRD dit pourquoi elle passe avant une autre, et
ce qu'il faut voir pour la déclarer faite.

Les épopées sont ordonnées par ce qu'elles protègent : d'abord le chiffre,
ensuite ce qu'on en fait, ensuite la matière première, ensuite le confort.

---

## E1 — Le chiffre est juste

**Pourquoi en premier.** Un pourcentage faux rend tout le reste inutile, y
compris le soin apporté à l'afficher.

| Récit | État | Critère d'acceptation |
|---|---|---|
| Marcher sur une route parallèle ne crédite pas le sentier | ✅ #52 | Un cas mesuré dans `matchingQuality.test.ts` passe de 100 % à 0 % |
| Traverser un sentier perpendiculairement ne crédite rien | ✅ #52 | Idem, avec le chiffre avant/après |
| Un GPS qui n'enregistre qu'un point tous les 500 m est crédité | ✅ #52 | Distance au **segment**, pas au point |
| Le seuil de « bouclé » se règle (90/95/100 %) | ✅ #116 | Le choix survit au rechargement |
| Exploiter le `hdop` des GPX | ⏸️ #95 | **Bloqué** : demande des traces réelles avec `hdop` renseigné pour établir un facteur. Ne rien inventer. |

**Non-but** : deviner le sens de parcours. Un aller-retour et un aller simple
donnent le même chiffre, et c'est acceptable.

---

## E2 — Le chiffre s'explique

**Pourquoi.** Un chiffre juste mais inexpliqué se lit comme un bug. C'est la
famille de défauts la plus fréquente trouvée par les personas.

| Récit | État | Critère d'acceptation |
|---|---|---|
| Une relation OSM trouée est signalée, pas silencieusement comptée | ✅ | Avertissement dans la liste et la fiche |
| L'âge de la donnée OSM est affiché, pas seulement celui du cache | ✅ #115 | Date de dernière modification de la relation |
| Les sorties hors zone chargée sont nommées | ✅ #133 | « 1 de vos 2 sorties est hors de la zone chargée » |
| Les kilomètres d'un seul tenant sont distingués du cumul | ✅ #118 | Plus longue série continue affichée |
| Un point d'intérêt annonce son détour | ✅ #122 | Distance au tracé sur chaque POI |
| Une source n'est pas déclarée potable | ✅ #123 | « potabilité non renseignée » quand OSM se tait |
| La coloration « parcouru » épouse les lacets | ✅ #142 | Portion découpée sur la géométrie réelle du chemin, pas sur les échantillons |

**Non-but** : masquer les défauts de donnée pour faire joli. Un trou dans
OpenStreetMap se dit.

---

## E3 — Le chiffre désigne la suite

**Pourquoi.** « 43 % » est un constat ; « voici les 8 km qui manquent, à 12 km
de chez vous » est une sortie de dimanche. C'est le différenciateur produit.

| Récit | État | Critère d'acceptation |
|---|---|---|
| « Prochaine sortie » : le plus long tronçon restant, pondéré par l'approche | ✅ | Trois propositions, cliquables |
| Épingler un itinéraire comme objectif | ✅ #13 | Persistant, avec ses tronçons restants cliquables |
| Franchir un jalon est annoncé | ✅ #117 | L'annonce tient tant qu'elle est vraie |
| Confort du tracé : aller-retour, boucle, D+ prévisionnel | ✅ #137 | Trois boutons ; le D+ se demande, une seule requête. Poignées de déplacement non faites |

---

## E4 — La matière première est complète

**Pourquoi ici et pas plus haut.** Un réseau incomplet fait voir un trou qui
n'existe pas sur le terrain — grave, mais moins que le calcul lui-même, et
largement hors de notre contrôle.

| Récit | État | Critère d'acceptation |
|---|---|---|
| Boucles communales de la Métropole de Lyon | ✅ | Fusionnées, licence citée |
| Lire un GeoJSON de sentiers quelconque | ✅ #128 | Import générique, projection refusée si non WGS84 |
| PDIPR départementaux (Ain, Isère, …) | ⏸️ #87 | **Bloqué** : sources injoignables depuis le conteneur ; le Rhône n'a pas activé le téléchargement chez le producteur |
| API Geotrek du Parc du Pilat (~200 circuits) | ⏸️ #88 | **Bloqué** : même raison |
| Cartoguides du Rhône manquants dans OSM | ⏸️ #20 | **Bloqué** : demande d'interroger Overpass en vrai |

**Décision** : tant que ces sources restent injoignables, l'effort va à
l'import générique (fait) plutôt qu'à des intégrations devinées. Un lecteur
GeoJSON qui marche vaut mieux qu'un connecteur écrit contre un schéma
supposé.

---

## E5 — Les données appartiennent à l'utilisateur

| Récit | État | Critère d'acceptation |
|---|---|---|
| **Enregistrer une sortie** | ✅ | Démarrer / pause / terminer / abandonner ; survit à un onglet tué, reprise en pause ; la position ne quitte pas l'appareil. Batterie non mesurée (`docs/PROTOCOLE_BATTERIE.md`) |
| Import GPX, FIT, TCX, archives ZIP Strava/Garmin | ✅ | Détection à la signature, pas à l'extension |
| Export d'un itinéraire en GPX avec attribution ODbL | ✅ | |
| Sauvegarde complète exportable et réimportable | ✅ #132 | Aller-retour vérifié sur base effacée ; restaurer ajoute sans écraser |
| Le prix du « tout local » est annoncé | ✅ #132 | Dit dans « À propos » et dans la section Sauvegarde |

**Non-but, définitif** : un compte et une synchronisation serveur.

---

## E6 — Utilisable dehors, sur un téléphone

| Récit | État | Critère d'acceptation |
|---|---|---|
| Position GPS, jamais transmise | ✅ #51 | Précision annoncée, mauvaise précision signalée |
| Hors-ligne (service worker, cache de tuiles borné) | ✅ #53 | Le bandeau dit ce qui marche **et** ce qui ne marche pas |
| Mise en page téléphone (feuille à trois positions, cibles ≥ 24 px) | ✅ #14 partiel | `docs/AUDIT_MOBILE.md`, M0–M8 mesurés |
| Validation sur appareils réels | ❌ #14 | **Ne peut pas être fait ici** : un Chromium sans tête n'est pas un doigt, et n'est pas Safari iOS |

---

## E7 — Trouver par où commencer

| Récit | État | Critère d'acceptation |
|---|---|---|
| Zones prédéfinies et grands itinéraires en un clic | ✅ | |
| Recherche par nom de ville (BAN) | ✅ #131 | « Introuvable » et « en panne » sont deux messages distincts |
| Filtres de découverte (distance, D+, durée, boucle, proximité) | ✅ | |
| Vocabulaire du premier écran (« ref », « GRP », « tolérance ») | 🔜 | Reste à reprendre : juste, mais suppose tout acquis |

---

## Ce qui n'entrera pas dans ce PRD

Repris du brief, listé ici pour qu'aucune épopée ne s'y glisse par la bande :
navigation vocale, fil social, photos, notation d'itinéraires, météo,
hébergements marchands, compte utilisateur, mesure d'audience.

## Comment un récit devient « fait »

La méthode existe déjà et fonctionne ; elle n'est pas à réinventer :

1. test unitaire d'abord sur `src/core`, avec le chiffre avant/après quand il
   s'agit du calcul ;
2. test e2e Playwright sur le comportement visible ;
3. `lint`, `typecheck`, `coverage` (90 % sur `src/core`, un cliquet mesuré
   sur `src/store` et `src/lib`), `build`, e2e,
   monkey — **tous verts avant** le commit ;
4. une PR par sujet, rien de mergé sans CI verte, déploiement vérifié.
