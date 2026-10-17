# Audit applicatif — 17/10/2026

Phase B du plan agentique du 16/10 (`docs/PLAN_AGENTIQUE_16_10.md`) : un
audit unique, après que la Phase A a épuisé les items codables du backlog.
Méthode : skill `audit-ui`. Dernier audit global comparable : `AUDIT_UX_24_08.md`
puis la revue de personas du 28/08 — ce document reprend le fil là, en ciblant
ce que les sprints 1-9 (08-16/10) ont changé et que personne n'a encore
ausculté avec `document.elementFromPoint`.

## Méthode suivie

1. `npm run build` → `✓ built in 1.44s`, `dist/` à jour avant toute mesure.
2. `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
   tests/e2e/regles-d-ecran.spec.ts --workers=1` → **46 tests, 46 passés, 0
   échec** (2,5 min). Quatre largeurs (390/800/1024/1280) × huit états ×
   quatre questions, plus gros texte à 390 et 1280.
3. Lecture de `git log --oneline` depuis fin août (67 commits) pour choisir
   ce qui n'a jamais été regardé avec cette méthode : découpage des onglets
   (#171, #491), badges GRP tiretés (#360/#530), ligne « Source : … » dans
   « Mes itinéraires » (#541), zone Nouvelle-Calédonie et couche GR Nord
   (#505/#537).
4. Un script Playwright jetable, configuré avec les quatre réglages que le
   CLAUDE.md §1bis impose avant de lire le premier chiffre (`hasTouch`,
   largeur, état, taille de texte) — une première version sans `hasTouch`
   a rapporté un faux défaut de 32 px sur des `<summary>`, corrigé avant
   d'être cru (voir plus bas).
5. Captures d'écran aux largeurs 390/800/1280, ouvertes et regardées.
6. Personas de `docs/PERSONAS.md` : Théo (gros texte), Jeanine (plancher
   tactile), Sylvie (plancher au point de rupture, 800 px tactile), Camille
   (grand écran).

---

## Ce que la sonde existante confirme, sans rien trouver de neuf

Les 46 exécutions n'ont signalé **aucun** recouvrement, écrasement de
dessin vectoriel, débordement horizontal ni cible sous plancher parmi les
commandes propres à l'application, à aucune des quatre largeurs ni dans
aucun des huit états (accueil, zone chargée, fiche ouverte, mode simple,
zone sans itinéraire, filtres ouverts, réseaux masqués, points repliés) —
confirmé en gros texte à 390 et 1280 aussi.

Seules les commandes MapLibre (zoom, rotation, bascule d'attribution)
restent sous le plancher — relevé, pas bloquant, exactement comme le
fichier le documente déjà :

- tactile (390/800/1024) : `MapLibre 54×15, IGN 23×15, OpenStreetMap 92×15,
  Métropole de Lyon 107×15, Province Nord 82×15` (plancher 44 px, WCAG
  2.5.5) ;
- souris (1280) : `MapLibre 46×12, IGN 20×12, OpenStreetMap 78×12,
  Métropole de Lyon 91×12, Province Nord 70×12` (plancher 24 px, WCAG
  2.5.8).

La cinquième entrée (« Province Nord ») est nouvelle depuis le dernier
audit (issue #537, GR Nord) et tombe dans la même exclusion documentée que
les quatre autres attributions de bibliothèque — rien à corriger ici, c'est
la confirmation que l'exclusion existante couvre bien l'ajout.

---

## Constat 1 — deux onglets entiers ne sont auscultés par aucune sonde automatique, et rien de neuf n'y est caché

**La mesure.** `tests/e2e/regles-d-ecran.spec.ts` et les tests « gros texte »
n'appellent jamais `ouvrirOnglet`/`surChaqueOnglet` pour les onglets
`sorties` et `reglages` — confirmé par lecture (`grep -n "surChaqueOnglet|onglet-"
tests/e2e/regles-d-ecran.spec.ts` ne retourne qu'un seul usage, `onglet-progression`,
dans la fonction qui ouvre la fiche détail). En disposition compacte
(≤ 800 px, `LARGEUR_COMPACTE_MAX` dans `src/lib/ecran.ts`), `App.tsx` ne
**monte même pas** les composants des sections non actives
(`visible('itinerairesPerso') && <CustomItineraries />`, ligne 507) : à
390 et 800 px, les huit états existants ne font jamais apparaître dans le
DOM ni « Mes itinéraires » (import GPX/GeoJSON, ligne « Source : … », bouton
« Tracer sur la carte ») ni le panneau « Réglages » (précision GPS, seuil
« bouclé », sauvegarde, affichage).

**Où.** 390 px et 800 px (tactile), onglets `sorties` et `reglages`, états
normal et gros texte.

**Ce que j'ai mesuré une fois la sonde dirigée là.** Un itinéraire
personnalisé importé (nom et auteur longs, pour forcer le cas le plus
défavorable), puis les quatre questions (cibles tactiles, débordement,
recouvrement par `elementFromPoint`) rejouées à la main sur ces deux
onglets, aux deux largeurs, en texte normal et en gros texte : **zéro
violation** — `cibles: []` dans les huit combinaisons, aucun débordement
de page ni de section. Le plancher de 44 px des `<summary>` (« Mes
itinéraires », « Mes traces », « Réglages ») tient, y compris en gros
texte.

**Ce que ça coûte.** Rien, aujourd'hui : ce coin de l'application se trouve
être propre. Mais c'est une propreté **non surveillée** — un futur
changement dans `Settings.tsx` ou `CustomItineraries.tsx` pourrait
introduire exactement le genre de défaut que le 24/08 a montré (un
recouvrement, un `<details>` oublié) sans qu'aucun test ne le voie, pour la
même raison que le panneau « Trouver une sortie » avant le 25/08 (§6quinquies).

**Ce qui l'a caché.** Pas un repli de `<details>` cette fois, mais un
filtrage par onglet entièrement équivalent dans ses effets : ce qui n'est
pas l'onglet actif n'est pas rendu. Le commentaire qui documente
`ouvrirOnglet` dans `tests/e2e/helpers.ts:388` (« La barre n'apparaît qu'en
dessous du point de rupture ») ne correspond plus au code actuel — la barre
d'onglets existe à toutes les largeurs depuis le 23/08, seul son effet de
filtrage dépend de la largeur (commentaire exact dans `App.tsx:179-187`). Un
commentaire resté vrai en apparence mais faux en substance n'alerte
personne (§4bis) ; ce n'est pas la cause du trou (le trou tient à ce que
personne n'a ajouté `surChaqueOnglet` aux huit états), mais c'est
compatible avec le fait que personne ne l'ait remarqué en relisant le
fichier.

*Non vérifié : le produit cartésien complet (6 des 8 états déjà couverts ×
les 2 onglets manquants) — seul l'état « zone chargée » a été mesuré sur
`sorties`/`reglages`. Les six autres combinaisons restent une zone grise,
moins prioritaire parce que ce premier sondage n'y a rien trouvé.*

---

## Constat 2 — l'attribution d'une source importée se réduit à une lettre sur téléphone

**La mesure.** Boîte de la ligne `data-testid="custom-source"` (« Source :
{auteur} », `CustomItineraries.tsx:169`) comparée à la largeur réelle du
texte (`scrollWidth`) :

| largeur | texte | boîte | texte complet | part visible |
|---|---|---:|---:|---:|
| 390 px, normal | 88 px | 88 px | 581 px | **15 %** |
| 390 px, gros texte | 65 px | 65 px | 747 px | **9 %** |
| 800 px, normal | 293 px | 293 px | 581 px | 50 % |
| 800 px, gros texte | 270 px | 270 px | 747 px | 36 % |

Capture de l'élément à 390 px (auteur de test : « Communauté de Communes du
Haut-Beaujolais et des Monts du Lyonnais ») : la ligne affiche
**littéralement** « Source : C… » — une seule lettre du nom du producteur.

**Où.** Onglet « Sorties », section « Mes itinéraires », à 390 px (le cas le
plus fréquent d'après `AUDIT_UX_07_10.md`).

**Ce que ça coûte.** La ligne existe précisément pour satisfaire
l'obligation d'attribution de la Licence Ouverte sur un import PDIPR
(issue #541, qui cite Léa — voir `PERSONAS.md`). Une attribution réduite à
une initiale ne nomme plus le producteur : elle ne fait plus ce pour quoi
elle a été écrite.

**Ce qui n'est PAS un défaut ici, et pourquoi.** `.source` déclare
`text-overflow: ellipsis` (`CustomItineraries.module.css:101`) : ce n'est
pas un rognage non déclaré (CLAUDE.md l'interdit de signaler comme tel), et
la fiche détail de l'itinéraire porte déjà l'attribution complète sans
troncature (`attribution-import.spec.ts`, test « un fichier qui déclare sa
source la porte jusqu'au GPX »). Ce n'est donc pas la disparition de
l'information, seulement sa **visibilité dans la liste**.

**Question qui demande une personne, pas une mesure de plus.** Une seule
lettre visible suffit-elle à l'intention de l'issue #541 (« se distinguer
d'un tracé personnel au premier regard »), ou faut-il un second niveau —
texte sur deux lignes, bulle au clic, nom abrégé calculé plutôt que coupé
par la largeur ? Trancher cela change une présentation (§6sexies), pas un
calcul ; à montrer à Léa ou à quelqu'un import un vrai PDIPR, avec un nom de
producteur réel (les noms de collectivités françaises dépassent souvent
30 caractères, comme dans ce test).

---

## Constat 3 (confirmation, rien à corriger) — le badge GRP tireté reste lisible jusqu'à sa plus petite taille de rendu

**La mesure.** La légende de carte (`MapLegend.tsx`) peint le témoin GRP
dans une pastille de **10 × 10 px**, avec
`repeating-linear-gradient(90deg, couleur 0-4px, transparent 4-8px)`
(confirmé par `getComputedStyle(...).backgroundImage`). Sur 10 px de large,
la période de 8 px rend deux segments de couleur (4 px puis 2 px) séparés
d'un segment transparent de 4 px.

**Où.** Légende de carte, 390 px, item `[data-reseau="GRP"]` — la plus
petite surface où ce motif est peint (le tracé sur la carte elle-même est
bien plus large).

**Ce que la capture montre.** Deux marques orange distinctes, visuellement
séparées du carré plein du badge GR voisin — le motif qui distingue GR de
GRP pour un œil deutéranope (issue #360/#530, ΔE 6,9 documenté le 28/08,
couleurs inchangées depuis) reste lisible même réduit à 10 px, pas
seulement sur le tracé de carte où il a été mesuré la première fois.

**Rien à corriger.** Ce constat confirme un correctif existant plutôt que
d'en trouver un nouveau — gardé ici pour éviter de re-mesurer la même chose
dans six mois (même logique que les « ceux qui n'ont rien trouvé » de la
revue du 28/08).

---

## Ce qui n'a pas pu être vérifié tel quel

La zone Nouvelle-Calédonie et le message « Relief indisponible ici »
(#505/#531) n'ont pas été remesurés ici : la sonde jetable utilisait le
mock d'altimétrie générique (`mockElevation`, valeurs synthétiques
croissantes), qui ne reproduit pas le `-99999` renvoyé par le vrai service
IGN sur cette zone — ce cas a déjà son propre test e2e dédié, cité dans le
commit du 08/10 (« avec un e2e qui le prouve »). Relancer cette mesure
spécifique aurait demandé le mock dédié (`mockElevationHorsCouverture`,
déjà présent dans `tests/e2e/helpers.ts`) plutôt qu'une nouvelle sonde —
non refait ici pour ne pas dupliquer un test qui existe déjà et qui, lui,
est vert.

---

## Questions qui demandent une personne (récapitulatif)

1. **Constat 2** — une attribution réduite à une lettre dans « Mes
   itinéraires » satisfait-elle l'intention de l'issue #541, ou faut-il un
   second niveau de présentation ? À montrer à Léa, ou à quelqu'un import
   un vrai PDIPR.

Une seule question de ce type dans cet audit — les deux autres constats
(sonde existante, badge GRP) ne demandent personne : l'un ne trouve rien de
neuf à trancher, l'autre confirme un chiffre déjà tranché le 28/08.

---

## Ce qui reste à faire si cet audit se prolonge

- Le produit cartésien complet état × onglet (48 combinaisons au lieu des
  8 actuelles) n'est mesuré nulle part ; ce premier sondage n'y a rien
  trouvé sur l'état « zone chargée », mais les sept autres états
  (notamment « filtres ouverts », « réseaux masqués ») n'ont pas été
  croisés avec `sorties`/`reglages`.
- Le commentaire périmé de `tests/e2e/helpers.ts:388` (§4bis) n'a pas été
  corrigé ici — Phase B n'ouvre pas Phase C, et ce n'est pas un défaut
  d'interface mais un texte qui vieillit mal ; à signaler pour la phase
  correctrice si elle le juge pertinent (ce n'est pas un constat mesuré en
  pixels, donc hors du périmètre strict de cet audit).
