# Audit produit — Sentiers

Rédigé le 19/08/2026, après lecture de deux audits externes (ChatGPT, Gemini)
et relecture du code. Volontairement critique : l'objectif n'est pas de
défendre l'existant.

**Mis à jour le 20/08/2026.** Le constat d'origine est conservé mot pour mot —
un audit qu'on réécrit après coup ne sert plus à rien. Chaque point porte
désormais son état, et le journal en fin de document dit ce qui a été livré.

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

   > **Réglé (PR #52).** Trois garde-fous, chacun corrigeant un faux résultat
   > mesuré : distance au **segment** GPS (et non au point), continuité
   > minimale d'un passage, et confirmation de proximité franche. La route
   > parallèle à 30 m ne crédite plus rien ; la traversée perpendiculaire non
   > plus ; un GPS qui n'enregistre qu'un point tous les 500 m est désormais
   > correctement crédité. Les cas sont figés dans
   > `tests/unit/matchingQuality.test.ts`, avec les chiffres avant/après.
   > **Reste ouvert** : le champ `hdop` est toujours ignoré.

2. **Aucune position GPS.** L'application est inutilisable en marchant : on
   ne sait pas où l'on est. C'est la première chose que fait n'importe quel
   concurrent. *Aucun fichier existant — à créer.*

   > **Réglé (PR #51).** Bouton « Où suis-je ? », suivi de position, précision
   > annoncée et signalée quand elle est mauvaise. La position n'est jamais
   > transmise nulle part.

3. **Rien ne fonctionne hors connexion.** Les tracés sont en IndexedDB, mais
   les **tuiles de carte ne sont pas mises en cache** et il n'y a pas de
   service worker : sans réseau, l'app ne se lance pas et la carte est
   blanche. Or le Pilat, les Monts du Lyonnais et la Loire ont de larges
   zones blanches. *À créer : service worker, cache de tuiles.*

   > **Réglé (PR #53, corrigé en #55).** Service worker écrit à la main,
   > précache généré au build, cache de tuiles borné à 600 entrées. Le
   > bandeau hors connexion dit **précisément** ce qui marche et ce qui ne
   > marche pas — charger une nouvelle zone reste impossible sans réseau, et
   > l'annoncer autrement se paierait en pleine forêt.

### P1 — l'usage réel

4. **Pas d'historique ni de progression dans le temps.** Les traces portent
   une date, jamais exploitée : pas de « mes sorties », pas de courbe de
   progression, pas de récapitulatif. Le cœur du positionnement B est donc
   incomplet. *`src/components/Dashboard.tsx`, store.*

   > **Réglé (PR #54, #66).** « Mes sorties » : totaux, histogramme mensuel
   > (les mois sans sortie sont conservés — un trou dans la pratique est une
   > information), et le bilan d'une sortie : ce jour-là, quels itinéraires
   > ont avancé et de combien.

5. **Pas de découverte.** Impossible de demander « une boucle de 2 h près
   d'ici ». La liste ne filtre que par réseau et par texte. Sans proximité
   ni durée ni difficulté, on ne choisit pas une randonnée.
   *`src/components/ItineraryList.tsx`.*

   > **Réglé (PR #56).** Filtres longueur, durée, dénivelé, forme (boucle ou
   > aller simple, déduite de la géométrie) et proximité de la position GPS.
   > Règle tenue partout : **on ne filtre jamais sur une donnée absente** — un
   > dénivelé inconnu n'est pas un dénivelé nul.

6. **Contraste des tracés insuffisant en plein soleil.** Les lignes n'ont pas
   de liseré (casing) : un tracé rouge sur fond IGN devient illisible dehors.
   Seul point concret et juste de l'audit Gemini. *`src/components/MapView.tsx`.*

   > **Réglé (PR #51).** Liseré blanc sous les tracés (deux couches
   > superposées ; `line-gap-width` ferait tout autre chose).

7. **Profil altimétrique inerte.** Le graphique existe mais ne dialogue pas
   avec la carte : survoler le profil ne montre pas où l'on est.
   *`src/components/ElevationChart.tsx`.*

   > **Réglé (PR #57).** Survoler le graphique pose un marqueur sur le tracé,
   > au clavier comme à la souris. Le profil porte désormais les coordonnées
   > alignées sur les distances — elles existaient déjà, elles étaient jetées.

8. **Qualité des données non exposée.** On affiche les itinéraires OSM sans
   dire s'ils sont complets, datés, ou douteux. Une relation à géométrie
   discontinue produit un pourcentage faux sans le signaler.
   *`src/core/overpass.ts`.*

   > **Réglé (PR #69, #70).** `src/core/dataQuality.ts` compte les morceaux
   > distincts d'une relation et mesure les interruptions, en réutilisant la
   > mise en chaîne écrite pour les étapes. La fiche détail affiche
   > l'avertissement quand il y a lieu ; la liste porte un marqueur discret
   > sur les tracés incomplets, pour ne pas avoir à ouvrir chaque fiche. Un
   > âge de plus de 30 jours est signalé avec la marche à suivre.
   > **Reste ouvert** : rien n'est dit sur la *fraîcheur amont* (date de
   > dernière modification dans OSM), que l'API Overpass sait pourtant
   > donner — ce serait le prochain pas.

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

**P0 — sans quoi ce n'est pas une application de randonnée** — ✅ **terminé**
1. ~~Fiabiliser le matching~~ (PR #52)
2. ~~Position GPS sur la carte~~ (PR #51)
3. ~~Hors-ligne réel~~ (PR #53, #55)

**P1 — l'expérience** — ✅ **terminé**
4. ~~Historique des sorties et progression dans le temps~~ (PR #54, #66)
5. ~~Découverte : filtres distance / durée / D+ / proximité / boucle~~ (PR #56)
6. ~~Liseré des tracés~~ (PR #51)
7. ~~Profil altimétrique synchronisé avec la carte~~ (PR #57)
8. ~~Qualité des données exposée~~ (PR #69, #70) — complétude et fraîcheur du
   cache. Reste : la date de dernière modification dans OSM.

**P2 — la différenciation**
9. ~~« Prochaine sortie » : quel tronçon non parcouru, proche, ferait le plus
   progresser~~ (PR #58) — l'endroit où l'app peut être meilleure que tout
   le monde, et le premier point où elle l'est.
10. ~~Jalons de complétion et seuil « bouclé »~~ (PR #60) ; ~~étapes des longs
    GR~~ (PR #65) ; ~~bilan partageable~~ (PR #62).
11. **Objectifs et collections personnelles** — à faire (issue #13, en partie
    couverte par « Prochaine sortie »).
12. **Le routage n'accroche qu'aux sommets** et ne connaît que les
    itinéraires chargés — limite assumée, à rouvrir si elle gêne (issue #21).

**P3 — plus tard**
Tuiles vectorielles (à ne lancer que si la mesure le réclame), ~~import FIT~~
(issue #7, PR #74), `og:image` — suspendue tant que l'usage de la balise
blanc/rouge n'est pas tranché juridiquement (issue #2).

**Mobile — ✅ terminé** (audit `docs/AUDIT_MOBILE.md`, constats M0 à M8)
Cibles tactiles (#100), en-tête (#99), sélecteur de zone (#98), bas de carte
(#103), textes tactiles (#100), typographie (#104), **part de la carte**
(#110), **fiche détail** (#113). Le tableau avant/après est dans l'audit.

**Reste du rapport ChatGPT du 19/08** — traité pour l'essentiel : attente
Overpass (#105), rôle de la carte (#107), `<noscript>` (#108). Restent ouverts
les sujets de données et de contenu : PDIPR en open data (#87), import
d'archives Strava/Garmin (#88), TCX (#89), bilan annuel (#90), plus grande
composante connexe (#91), seuil de complétion réglable (#92), tuiles
vectorielles (#93), documents BMAD (#94), `hdop` (#95), fraîcheur amont
OSM (#96).

## Journal — nuit du 19 au 20 août 2026

Vingt-deux PR, chacune avec ses tests, mergée seulement CI verte.

| PR | Ce qu'elle apporte |
|---|---|
| #49 | Export GPX d'un itinéraire, avec l'attribution qui va avec |
| #50 | Cet audit |
| #51 | Position GPS + liseré des tracés |
| #52 | **Matching fiabilisé** — les faux positifs mesurés éliminés |
| #53 | Hors-ligne : service worker, précache, bandeau honnête |
| #54 | « Mes sorties » : historique et rythme de pratique |
| #55 | Bandeau hors-ligne fiabilisé — et **CI de `main` réparée** |
| #56 | Filtres de découverte |
| #57 | Profil altimétrique lié à la carte |
| #58 | « Prochaine sortie » |
| #59 | Finitions P2 design (issues #37 à #40) |
| #60 | Jalons et itinéraires bouclés (seuil 95 %) |
| #61 | Fiabilisation des e2e (clic sur canvas) |
| #62 | Bilan partageable en image, fabriqué sur l'appareil |
| #63 | Avancement d'import — après **mesure** : 420 ms pour 9 Mo |
| #64 | Tests unitaires du store |
| #65 | Étapes des longs GR |
| #66 | Bilan d'une sortie |
| #67 | Découpage de `MapView` (644 → 226 lignes) |
| #68 | Audit et README remis à jour |
| #69 | Qualité de la donnée : relations trouées signalées |
| #70 | Marqueur de tracé incomplet dans la liste |

Deux décisions valent d'être retenues, parce qu'elles disent non :

- **Pas de parseur GPX dans un worker** (issue #4). La mesure donne 420 ms
  pour un fichier de 9 Mo, pas « plusieurs secondes ». `DOMParser` n'existant
  pas dans un worker, il faudrait un second parseur à garder d'accord, qui
  perdrait la détection des fichiers tronqués. Le compte n'y est pas.
- **Pas d'`og:image`** tant que #2 n'est pas tranchée : produire un visuel de
  marque autour de la balise blanc/rouge avant l'avis juridique serait
  précisément l'erreur que l'issue veut éviter.

## Journal — matinée du 20 août 2026

Douze PR de plus, dans la continuité de l'audit mobile (`docs/AUDIT_MOBILE.md`)
et du rapport ChatGPT du 19/08.

| PR | Ce qu'elle apporte |
|---|---|
| #102 | Le repère du profil altimétrique tient sous le doigt |
| #103 | Légende, attribution et état d'accueil rendus au bas de la carte |
| #104 | Plancher typographique : six tailles ramenées à trois paliers, 14 px sur tactile |
| #105 | Attente Overpass : octets reçus et consigne anti-rechargement |
| #106 | **Trace importée pendant le démarrage : ne disparaît plus** |
| #107 | La carte s'annonce comme une région, pas comme une application |
| #108 | `<noscript>` : le site dit ce qu'il fait sans JavaScript |
| #109 | **Zone chargée au démarrage : enfin mise en cache** |
| #110 | **La carte prend l'écran sur téléphone**, panneau en feuille glissante |
| #112 | Tests : attendre que la carte écoute avant de lui parler |
| #113 | Fiche détail : le tracé reste visible au-dessus du panneau |

Trois de ces PR ne corrigent pas un défaut d'interface mais un défaut de
données, trouvé en suivant un test qui échouait plutôt qu'en le relançant :

- **#106** — au démarrage, la restauration d'IndexedDB écrasait une trace
  déposée pendant la lecture. Elle disparaissait sans un mot, et son doublon
  n'était même plus détecté. Le test « instable » de `customs.spec` avait
  raison depuis le début ; personne ne l'avait écouté.
- **#109** — une zone choisie pendant l'ouverture de la base n'était jamais
  mise en cache. Chaque visite repartait pour deux minutes d'Overpass avec les
  données déjà téléchargées. Deux causes distinctes : `db` figé à `null`, puis
  l'écriture de la dernière zone lancée après l'affichage.
- **#102** — au doigt, la fin du contact émet un `pointerleave` : le repère
  posé sur le profil s'effaçait aussitôt. Le geste décrit par la consigne à
  l'écran ne fonctionnait pas sur le support où il est le plus naturel.

Une décision de produit a été prise plutôt que reportée : **#77 demandait de
trancher la disposition mobile avant de coder**. Choix retenu — carte plein
cadre, panneau en feuille à trois positions, position d'ouverture qui suit les
données (mi-hauteur à la première visite, repliée au retour). La barre
d'onglets a été écartée : elle sépare la carte de la progression, alors que le
produit consiste à regarder les deux ensemble.

## Journal — après-midi et soirée du 20 août 2026

Le fil conducteur de cette série n'est plus l'audit mobile mais
`docs/PERSONAS.md` : six personnes suivies pas à pas dans l'application, et
l'endroit exact où chacune s'arrête. Trois constats revenaient chez
plusieurs d'entre elles ; ils sont devenus #131, #132 et #133.

| PR | Ce qu'elle apporte |
|---|---|
| #134 | Les six personas, et l'écart entre les deux chiffres enfin dit (#133) |
| #135 | Sauvegarde complète exportable et réimportable (#132) |
| #136 | Recherche par nom de ville, via la BAN (#131) |
| #138 | Vignette de prévisualisation du lien partagé (#8) |
| #139 | MapView de 242 à 100 lignes, store testé sans navigateur (#9) |
| #140 | Objectifs épinglés et tronçons restants (#13) |
| #141 | Brief, PRD et architecture (#94) |

Trois choses méritent d'être notées, parce qu'elles ont changé une décision :

- **#133 ne corrige aucun calcul.** « Mes sorties » additionne toutes les
  traces, le tableau de bord ne compte que la zone chargée : les deux chiffres
  sont justes, et leur écart n'était expliqué nulle part. On rentre de
  Bretagne, les kilomètres montent d'un côté et le pourcentage ne bouge pas
  de l'autre. La correction est une phrase, pas une formule.
- **#140 a changé d'endroit en cours de route.** L'étoile « objectif » était
  d'abord posée sur chaque ligne de la liste ; chaque entrée portait alors
  deux boutons contenant le nom de l'itinéraire, et quatorze tests ne savaient
  plus lequel viser — un lecteur d'écran non plus. Le bouton est passé dans la
  fiche, qui est de toute façon l'endroit où l'on décide.
- **#139 a révélé un test qui gagnait par chance.** Le repère épinglé du
  profil altimétrique était lu juste après le déplacement de souris, sans
  attente : une course gagnée par marge jusqu'à ce qu'une souscription de plus
  au store la fasse perdre. Le test attend désormais le marqueur *avant* le
  geste qu'il mesure — ce qu'il vérifie, c'est la survie du repère, pas sa
  vitesse d'arrivée.

Quatre sujets restent **bloqués faute d'accès réseau**, et le rester est un
choix plutôt qu'un oubli : #95 (le facteur de conversion du `hdop` demande de
vraies traces), #87 et #88 (sources départementales et Geotrek injoignables),
#20 (demande d'interroger Overpass en vrai). Aucun n'a été « avancé » en
devinant un schéma.

## Journal — fin de session du 20 août 2026

Trois demandes menées à la suite, plus un audit externe reçu en cours de route.

| Sujet | Résultat |
|---|---|
| Page publique « pourquoi Sentiers » | Livrée, autonome (ni bundle ni JavaScript), dernière ligne de #19 |
| Seconde passe personas | `docs/PERSONAS.md` gagne une seconde partie ; quatre issues ouvertes |
| Alignement du nom du dépôt | **Pas faisable ici** : renommer relève des réglages du dépôt, hors de mes outils. Checklist et remplacements préparés dans #162 |
| Audit externe « brutal et transformation » | Mesures rejouées, neuf issues ouvertes, index dans #157 |

Trois choses méritent d'être notées.

**La passe personas a trouvé un bouton mort, né le jour même.** Sylvie cherche
« Saint-Étienne », charge la zone, clique « Actualiser les tracés » : rien. La
clé d'une zone « Autour de… » n'est pas un identifiant de `ZONES`, `loadZone`
retournait sans rien faire, et aucun message ne le disait. La recherche par
lieu, livrée quelques heures plus tôt, marchait — son entretien non. La leçon
dépasse le bug : **chaque nouvelle sorte d'objet doit être promenée dans les
fonctions transverses qui existent déjà** — actualiser, supprimer, exporter,
restaurer.

**L'audit externe n'a pas été transcrit, il a été rejoué.** Ses treize tests
adverses passent sur le code actuel, et sa trouvaille principale a été
remesurée directement : l'espacement des points GPS produit une *falaise*, pas
une dégradation — 780 m entre points crédite 100 %, 1,2 km crédite 0 %. Une
montre en mode économie de batterie rend donc une bibliothèque entière
illisible, sans un mot. C'est #148, et c'est le plus grave constat ouvert.

**Quatre affirmations de l'audit étaient périmées** — il dit lui-même n'avoir
pas pu lire les issues. La fraîcheur amont OSM *est* affichée (#115), la vue
3D *existe*, les objectifs *ont été livrés* (#140), et les POI *sont* dans la
fiche. Le détail est dans #157 : un audit qu'on recopie sans vérifier fait
rouvrir des chantiers déjà finis.

## Definition of done retenue

Une fonctionnalité n'est livrée que si : tests unitaires sur `src/core`,
e2e Playwright si elle touche l'interface, lint + typecheck + couverture +
build + e2e + monkey verts, README à jour, et déploiement vérifié. Le build
seul ne suffit pas.
