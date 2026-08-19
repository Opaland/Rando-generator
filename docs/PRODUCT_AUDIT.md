# Audit produit — Sentiers

Rédigé le 19/08/2026, après lecture de deux audits externes (ChatGPT, Gemini)
et relecture du code. Volontairement critique : l'objectif n'est pas de
défendre l'existant.

## Verdict en une phrase

**La direction actuelle est la bonne, mais le produit repose sur un chiffre
dont la fiabilité n'a jamais été démontrée.** La progression sur les réseaux
balisés est un créneau que personne n'occupe ; encore faut-il que le « 34 %
du GR 7 » soit vrai. C'est le chantier n° 1.

## Positionnement recommandé

Trois options se présentaient : application généraliste (A), application de
progression/collection (B), hybride (C).

**Recommandation : B, avec le minimum vital de C.** Se battre contre Komoot,
AllTrails ou Visorando sur la préparation et la navigation est perdu
d'avance — ils ont des bases éditoriales, des équipes et dix ans d'avance.
En revanche, personne ne répond à « quel pourcentage des sentiers balisés de
mon département ai-je parcouru ». Le minimum vital de navigation (position
GPS, hors-ligne) n'est pas un virage vers A : sans lui, on ne peut pas
utiliser l'app sur le terrain, donc pas alimenter la collection.

Corollaire : **ne pas développer** de navigation vocale, de recherche
d'hébergements marchands, de fil social, de photos, de météo. Chacune
existe en mieux ailleurs et dilue le propos.

## Les problèmes, par gravité

### P0 — la crédibilité du produit

1. **Le matching produit des faux positifs.** Un échantillon est marqué
   « parcouru » dès qu'un point GPS passe à moins de la tolérance
   (`src/core/matching.ts`, `matchSamples`). Conséquences mesurables :
   - marcher sur une **route parallèle à 30 m** d'un GR le marque parcouru à
     100 % avec la tolérance par défaut (50 m) ;
   - une **traversée perpendiculaire** marque 100 à 200 m comme parcourus ;
   - aucune notion de **continuité ni de sens** : « parcouru en entier » et
     « touché en douze endroits » donnent le même chiffre ;
   - la résolution de 100 m rend invisible tout aller-retour plus court ;
   - le champ `hdop` (précision GPS) des fichiers GPX est ignoré.

   Ce n'est pas un détail d'implémentation : c'est la proposition de valeur.
   *Fichiers : `src/core/matching.ts`, `src/core/sampling.ts`.*

2. **Aucune position GPS.** L'application est inutilisable en marchant : on
   ne sait pas où l'on est. C'est la première chose que fait n'importe quel
   concurrent. *Aucun fichier existant — à créer.*

3. **Rien ne fonctionne hors connexion.** Les tracés sont en IndexedDB, mais
   les **tuiles de carte ne sont pas mises en cache** et il n'y a pas de
   service worker : sans réseau, l'app ne se lance pas et la carte est
   blanche. Or le Pilat, les Monts du Lyonnais et la Loire ont de larges
   zones blanches. *À créer : service worker, cache de tuiles.*

### P1 — l'usage réel

4. **Pas d'historique ni de progression dans le temps.** Les traces portent
   une date, jamais exploitée : pas de « mes sorties », pas de courbe de
   progression, pas de récapitulatif. Le cœur du positionnement B est donc
   incomplet. *`src/components/Dashboard.tsx`, store.*

5. **Pas de découverte.** Impossible de demander « une boucle de 2 h près
   d'ici ». La liste ne filtre que par réseau et par texte. Sans proximité
   ni durée ni difficulté, on ne choisit pas une randonnée.
   *`src/components/ItineraryList.tsx`.*

6. **Contraste des tracés insuffisant en plein soleil.** Les lignes n'ont pas
   de liseré (casing) : un tracé rouge sur fond IGN devient illisible dehors.
   Seul point concret et juste de l'audit Gemini. *`src/components/MapView.tsx`.*

7. **Profil altimétrique inerte.** Le graphique existe mais ne dialogue pas
   avec la carte : survoler le profil ne montre pas où l'on est.
   *`src/components/ElevationChart.tsx`.*

8. **Qualité des données non exposée.** On affiche les itinéraires OSM sans
   dire s'ils sont complets, datés, ou douteux. Une relation à géométrie
   discontinue produit un pourcentage faux sans le signaler.
   *`src/core/overpass.ts`.*

### P2 — les limites connues, assumées mais à documenter

9. **Le routage accroche aux sommets, pas aux segments.** Cliquer au milieu
   d'un long tronçon rectiligne peut répondre « aucun sentier à proximité ».
   Et le graphe ne contient que les itinéraires **chargés** : on ne peut pas
   tracer « de A à B » via un chemin qui n'appartient à aucune relation
   balisée. *`src/core/routing.ts`.*

10. **Le rendu ne tiendra pas à l'échelle d'une région.** GeoJSON brut dans
    MapLibre ; une zone très dense fera ramer les mobiles modestes. La
    parade connue est le passage aux tuiles vectorielles — chantier lourd,
    à ne lancer que si le besoin se confirme par la mesure.

## Ce que les audits externes se sont trompés à dire

Pour ne pas courir après des fantômes :

- « Conflits gestuels, le pinch-to-zoom déclenche le scroll de la page » —
  **faux**. MapLibre GL gère nativement le verrouillage du contexte tactile
  sur son canvas. Problème réel de l'ère jQuery/Leaflet mal configuré.
- « Parsing GPX à fiabiliser » — **déjà fait** : XML validé, racine `<gpx>`
  vérifiée, formats `<trkpt>` et `<rtept>` supportés, messages d'erreur en
  français, doublons détectés par empreinte.
- « L'application charge des centaines de tracés simultanément » —
  **inexact** : une seule zone est chargée à la fois, jamais la région.
  Le risque de performance existe, mais pas sous cette forme.
- L'audit Gemini n'a pas lu le code ; ses conclusions sont des généralités
  de catégorie. Deux points sur cinq étaient néanmoins justes (hors-ligne,
  contraste) et sont retenus ci-dessus.

## Roadmap

**P0 — sans quoi ce n'est pas une application de randonnée**
1. Fiabiliser le matching (jeu de fixtures adverses, moteur amélioré,
   comparaison chiffrée avant remplacement).
2. Position GPS sur la carte.
3. Hors-ligne réel : service worker + cache de tuiles, avec un intitulé
   honnête sur ce qui fonctionne vraiment sans réseau.

**P1 — l'expérience**
4. Historique des sorties et progression dans le temps.
5. Découverte : filtres distance / durée / D+ / proximité / boucle.
6. Liseré des tracés (lisibilité extérieure).
7. Profil altimétrique synchronisé avec la carte.

**P2 — la différenciation**
8. « Prochaine sortie » : quel tronçon non parcouru, proche, ferait le plus
   progresser. C'est le seul endroit où l'app peut être meilleure que tout
   le monde.
9. Objectifs et collections personnelles.
10. Qualité des données exposée (complétude, fraîcheur, anomalies).

**P3 — plus tard**
Tuiles vectorielles, badges, partage, mode « suivi live » complet.

## Definition of done retenue

Une fonctionnalité n'est livrée que si : tests unitaires sur `src/core`,
e2e Playwright si elle touche l'interface, lint + typecheck + couverture +
build + e2e + monkey verts, README à jour, et déploiement vérifié. Le build
seul ne suffit pas.
