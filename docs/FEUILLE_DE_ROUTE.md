# Feuille de route — Sentiers

Écrite le 22/08/2026, sur `main` à `32643ad`, déployé et vert.

Elle dit **dans quel ordre** avancer et **pourquoi cet ordre**. Ce qui est
déjà décidé est dans `BRIEF.md` et `PRD.md` ; ce qui est mesuré est dans les
trois audits. Ici, seulement les prochains pas.

---

## Où en est le produit

**La boucle est complète.** Depuis la nuit du 22 au 23/08, Sentiers
enregistre une sortie : on appuie sur « Démarrer », on marche, le tracé se
dessine, on termine, et la sortie devient une trace comme une autre —
appariée, comptée, exportable. Elle survit à un onglet tué, et se retrouve
en pause au rechargement.

Le trou qui rendait la proposition de valeur dépendante d'un concurrent est
donc refermé. Ce qui reste de #152 est la **mesure de batterie**, qui ne se
fait pas dans un test : `docs/PROTOCOLE_BATTERIE.md` dit exactement quoi
relever, et aucun chiffre d'autonomie n'est affiché nulle part tant que la
séance n'a pas eu lieu.

Trois audits ont été menés : `AUDIT_MOBILE.md` (mise en page téléphone, neuf
constats, tous traités), `PRODUCT_AUDIT.md` (audit externe du 20/08),
`AUDIT_UX.md` (22/08, treize constats — les trois P0 sont corrigés, les dix
autres attendent).

---

## Ce qui attend une décision ou une donnée de Cédric

Ces cinq points ne sont pas des tâches en retard : ils sont **bloqués sur
quelque chose que le code ne peut pas produire**. Les débloquer coûte peu et
libère beaucoup.

| | Ce qu'il faut | Ce que ça débloque |
|---|---|---|
| **#150** | Un corpus de traces annotées — « ici je marchais, là j'étais en voiture ». `#204` dit exactement quoi et combien | Le seuil de vitesse du matching v3. Sans lui, on invente un nombre qui change ce qui est compté (CLAUDE.md §2) |
| **#171 / E2** | Cinq personnes, une séance | La navigation par onglets est en service par défaut depuis le 22/08 **sans** que la séance ait eu lieu. Le pari n'est pas encore validé |
| **#173 / E3–E4** | Théo (9 ans) et Jeanine (76 ans) menant chacun une tâche sans aide | L'issue reste ouverte tant que la preuve humaine manque — le code, lui, est fini |
| **#203** | Un arbitrage : doubler les réglages dans `localStorage` (synchrone) ou accepter la fenêtre | Un réglage changé puis rechargé dans la seconde est perdu. La fenêtre est étroite ; doubler crée deux sources de vérité |
| **#2** | Un avis juridique sur la balise blanc/rouge | L'identité visuelle repose dessus |
| **#152, pierre 4** | Deux téléphones, deux heures chacun — `docs/PROTOCOLE_BATTERIE.md` dit quoi relever | Le chiffre d'autonomie affiché à côté de « Démarrer ». Sans lui, on ne promet rien ; et si la consommation est mauvaise, ce sont ces mesures qui fixeront les seuils de filtrage des positions |

---

## Jalon 1 — Fermer la boucle : Sentiers enregistre une sortie (#152)

**Fait, sauf la mesure de batterie.** Quatre pierres étaient prévues ; les
trois premières sont livrées et déployées.

| pierre | état |
|---|---|
| 1. `core/recorder.ts`, la machine à états | livrée (#220) |
| 2. la persistance du tampon et la reprise après un onglet tué | livrée (#233) |
| 3. l'écran de marche, la géolocalisation, le tracé en direct | livrées (#234, #237) |
| 4. **la mesure de batterie** | **protocole écrit, séance à faire** |

Ce qui a été tranché en chemin, et qui ne se redécide pas sans raison :

- **une sortie reprise est en pause, jamais en marche.** Un onglet tué à
  10 h et rouvert à 13 h ne veut pas dire qu'on a marché trois heures ;
- **le segment qui enjambe une pause n'est pas compté.** On ne compte que
  ce qu'on a vu ;
- **un seul `watchPosition`** pour la carte et l'enregistrement ;
- **aucun filtre de bruit sur les positions retenues.** Distance minimale,
  intervalle minimal, seuil de précision : ces trois seuils changent ce qui
  est compté comme parcouru, et se mesurent sur des sorties réelles.

Ce qui suit décrit l'état d'avant, gardé parce que le pourquoi n'a pas
changé.

---

### Pourquoi c'était le seul P0

**Le constat que l'audit externe qualifie d'existentiel.**

> « Le produit a un seul problème existentiel : il ne sait pas encore
> accompagner une randonnée. Tout le reste est du raffinement. »

Aujourd'hui, pour voir sa progression, il faut enregistrer sa sortie dans
Strava ou Garmin, l'exporter, l'importer ici. **La proposition de valeur
dépend d'un concurrent.**

Ce que ça demande — `src/core/recorder.ts`, machine à états
`idle → recording → paused → done`, tampon de points horodatés persisté dans
IndexedDB à intervalle court (survivre à un écran verrouillé, un onglet tué,
une batterie vide), produisant un `Track` standard. Tout l'aval existe déjà.

Ce que ça ne doit pas devenir — **pas de la navigation.** Ni guidage, ni
instructions vocales, ni recalcul d'itinéraire. Enregistrer n'est pas
guider : c'est se souvenir.

Deux points non négociables :

- **la batterie se mesure avant qu'on promette quoi que ce soit.** Une
  position haute précision en continu vide un téléphone. Le chiffre
  s'annonce, comme le reste ;
- **la position ne quitte jamais l'appareil**, y compris en enregistrement.

Reste de ce jalon, et rien d'autre :

- **la séance de mesure de batterie** (`docs/PROTOCOLE_BATTERIE.md`). Deux
  appareils, deux heures chacun, une feuille de relevé. C'est un item
  bloqué sur Cédric, comme les cinq du tableau plus haut ;
- **« ce qu'il reste »** n'est pas affiché : cela suppose de savoir quel
  itinéraire on suit, ce que rien ne dit aujourd'hui, et le déduire de la
  position demande un appariement en direct dont le seuil change ce qui est
  compté (#150, #151).

---

## Jalon 2 — Les dix constats restants de l'audit UX

**Douze des treize sont traités** (nuit du 22 au 23/08). Ce qui suit décrit
l'état de l'audit au moment où il a été écrit ; seul **U11** reste ouvert,
et c'est un choix de design, pas un défaut mesuré :

> U11 — des émojis en couleur dans une palette qui n'en a pas. La barre
> d'onglets porte 🗺 👟 📈 ⚙ en couleurs natives, contre une palette tenue
> à quatre teintes sur papier crème. Trancher demande de décider ce qu'on
> veut à la place, et cela ne se décide pas seul de nuit.

Ils étaient petits, mesurés, et chacun a tenu dans une PR. Deux méritaient
de passer devant les autres.

**U4 — l'attribution OpenStreetMap est masquée sur 32 % de sa largeur**, sur
son début, par la légende de carte. À 810 px le recouvrement est total.
L'ODbL et la Licence Ouverte demandent une attribution visible : **c'est un
sujet de licence, pas d'esthétique.** À traiter en premier.

**U5 — « 0 % parcourus » s'affiche avant qu'il y ait quoi que ce soit à
parcourir.** Ce n'est pas décourageant, c'est faux : il n'y a pas 0 % de
parcouru, il n'y a rien à parcourir. Le libellé « Zones, traces et
réglages » existe pour ce cas et cède dès que le calcul rend `0` au lieu de
`null`.

Puis, par ordre de gêne : U6 (la légende mange 28 % de la carte visible sur
téléphone), U8 (la colonne trop étroite entre 800 et 1100 px), U7 (« Les
trois » ne dit pas de quoi il s'agit), U10 (le titre de la fiche cassé en
trois lignes), U9 (trois traitements pour l'action principale), U12
(« Glissez vos fichiers » sur un téléphone), U13 (le bouton qui rend le
panneau replié), U11 (les émojis en couleur).

---

## Jalon 3 — Tenir sur le terrain

Dans cet ordre, parce que chacun suppose le précédent :

- **#153 — télécharger une sortie pour le hors-ligne**. Trois pierres sur
  quatre sont posées : le corridor de tuiles (`src/core/corridor.ts`), le
  cache volontaire du service worker, et le bouton « Emporter cette
  randonnée » de la fiche détail. **Reste la quatrième** : les points
  d'intérêt, qu'Overpass sert en `POST` — le Cache API ne sait pas ranger une
  requête `POST`, il faudra donc les écrire dans IndexedDB, ce qui est un
  autre chemin que celui des tuiles.

  Deux réglages y sont posés **au jugement, faute de mesure**, et il faut le
  savoir avant de s'y fier : les zooms 12 à 16, et le corridor de 500 m
  (`ZOOMS_TERRAIN`, `RAYON_CORRIDOR_METRES`). Ce qui manque pour les
  trancher : **le poids réel d'une tuile de la Géoplateforme sur un secteur
  de montagne.** Personne ne l'a relevé, c'est pourquoi le bouton annonce un
  nombre de tuiles et non des mégaoctets. La mesure faite, on pourra
  afficher un budget avant de lancer, et prévenir avant les gros
  téléchargements — un GR de 200 km demande des milliers de tuiles, et pour
  l'instant le seul garde-fou est qu'on peut arrêter ;
- **#154 — prévenir quand on quitte le parcours suivi**. Attention : c'est la
  frontière de « pas de navigation ». Prévenir qu'on s'écarte n'est pas
  guider ; le vérifier auprès d'une personne avant de le construire ;
- **#151 — deux sentiers à moins de 20 m se créditent l'un l'autre**. Bug de
  matching, indépendant, à traiter quand le corpus de #150 sera là.

---

## Jalon 4 — Élargir la donnée

- **#87 — les PDIPR ouverts des départements** (Ain, Isère, puis les autres).
  C'est le plus gros gain de couverture pour le moins d'effort : un jeu par
  département, déjà ouvert, déjà structuré ;
- **#88 — l'API Geotrek du Parc du Pilat**, ~200 circuits balisés ;
- **#160 — Marc voit ce qui manque dans OSM et ne peut rien en faire** :
  rendre la contribution possible depuis la constatation.

Un mot de prudence appris à #179 : **tout ajout à la requête Overpass se
mesure avant d'être livré**, et le cache de zone porte désormais une version
(`SCHEMA_ZONE`) — l'incrémenter quand la requête rapporte quelque chose de
nouveau, faute de quoi les copies plus anciennes prétendent répondre à une
question qu'on ne leur a pas posée.

---

## Jalon 5 — La dette, quand elle gêne et pas avant

- **#155 — découper `appStore.ts`** (1 566 lignes) en tranches. Il gêne
  déjà : la revue du sprint 6 y a trouvé une course sur sept réglages qu'un
  fichier plus court aurait rendue visible ;
- **#159 — mesurer une grosse bibliothèque** : 800 activités à l'import ;
- **#93 — tuiles vectorielles**. Gros chantier, gain réel, aucune urgence ;
- **#170 — la distance est fausse à l'antiméridien**. P3 assumé : personne ne
  randonne à cheval sur la ligne de changement de date.

---

## Issues livrées qui restent à clore

À vérifier une par une avant de fermer — le code est fait, l'issue peut
demander davantage :

| Issue | Ce qui est livré | Réserve |
|---|---|---|
| #149 | Horodatage et hdop conservés par les trois parseurs | — |
| #175 | Historique consultable, recherche, groupement par année | — |
| #178 | Confidentialité montrée : le journal des sorties réseau | — |
| #179 | Pente, revêtement, déduction depuis `highway` | — |
| #171 | Onglets en disposition par défaut | **La séance E2 n'a pas eu lieu.** Ne pas fermer sur le seul code |

`#162` (renommer le dépôt) et `#15` (nom définitif) sont liés et attendent
une décision, pas du code.

---

## Ce qu'on ne fera pas

Écrit ici pour ne pas y revenir à chaque sprint :

- **pas de navigation** — ni guidage, ni voix, ni recalcul ;
- **pas de compte, pas de serveur, pas de télémétrie** ;
- **pas de bibliothèque de composants** (`DESIGN_SYSTEM.md` dit pourquoi) ;
- **pas de score, pas de classement, pas de comparaison entre personnes.**
  Les étoiles disent « ça a compté », pas « tu es meilleur que ».

---

## Comment on avance, rappel court

Le protocole complet est dans `CLAUDE.md` — dix règles, chacune née d'un raté
daté. Les trois qui coûtent le plus cher quand on les oublie :

1. **Un test qui ne peut pas échouer ne prouve rien.** Retirer le correctif,
   voir rouge. Cinq tests creux ont été trouvés dans la seule session du
   22/08, dont trois écrits dans l'heure.
2. **`npx tsc -b --noEmit`**, jamais `npx tsc --noEmit` — le projet utilise
   les références de projet, et la seconde commande ne vérifie rien.
3. **Rebuild avant les e2e**, et vérifier que le build a réussi. Playwright
   sert `dist/` : un build échoué en silence laisse tester une version
   périmée. Le piège s'est déclenché six fois en une session.

Un item par PR. TDD sur `src/core`. Commits en français. `/porte` avant de
committer, `/revue-sprint` après chaque sprint, `/revue-globale` après le
cycle.
