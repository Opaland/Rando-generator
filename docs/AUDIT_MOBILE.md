# Audit UI/UX mobile — Sentiers

Mesuré le 20/08/2026 sur un viewport **iPhone 13 (390 × 844 points CSS,
densité ×3, tactile)**, application réelle avec une zone chargée et une trace
importée. Les chiffres viennent de mesures dans le navigateur, pas d'une
impression : tailles de cibles relevées via `getBoundingClientRect`, débordement
via `scrollWidth`, tailles de police via `getComputedStyle`, et captures
d'écran des quatre états principaux.

C'est le premier regard porté sur le format téléphone alors que c'est **là que
l'application sera lue** : au retour d'une sortie, dans la voiture ou le train.

## Verdict

L'application *fonctionne* sur téléphone — rien ne déborde horizontalement,
rien n'est inaccessible. Mais elle y est **conçue comme une version réduite du
bureau** : le panneau latéral devient un long empilement à faire défiler, et la
carte, qui est le produit, se retrouve reléguée à 40 % de l'écran, sous une
colonne de réglages.

## Les problèmes, par gravité

### M0 — cibles tactiles sous le minimum

**Mesuré.** Sur 85 éléments interactifs, **56 mesurent moins de 44 px** de haut
ou de large. Plus grave, plusieurs passent sous les **24 × 24 px** exigés par le
critère WCAG 2.2 AA « Target Size (Minimum) » (2.5.8) — ce n'est plus une
préférence de confort, c'est un critère d'accessibilité :

| Élément | Taille mesurée |
|---|---|
| Cases à cocher des réseaux (GR, GRP, PR, Boucle) | **13 × 13** |
| En-têtes d'accordéon (`<summary>` : Zone, Mes traces, Tableau de bord…) | 358 × **23** |
| Bouton de fermeture de l'annonce de jalon | 27 × **20** |
| Curseur de tolérance | 294 × **16** |
| Listes déroulantes des filtres | 141 × **26** |
| Boutons de zoom de la carte | 29 × 29 |
| Liens d'attribution (IGN, OpenStreetMap) | 78 × **12** |

Les en-têtes d'accordéon sont le cas le plus dommageable : sur mobile, **ils
sont la navigation principale**, et ils font 23 px de haut.

### M1 — la carte n'a que 40 % de l'écran

**Mesuré** : carte 338 px sur 844. Le panneau latéral occupe 60 % (`max-height:
60vh`), la carte 40 % (`min-height: 40vh`). Sur une application dont la
proposition est « voir sa progression sur une carte », le rapport est inversé.

### M2 — l'en-tête mange un cinquième de l'écran

La phrase de confidentialité (« Vos traces GPX ne quittent jamais votre
navigateur — aucun compte, aucun serveur, aucune télémétrie ») se replie sur
**sept lignes** dans une colonne étroite à côté du logo. Résultat : ~170 px
d'en-tête sur 844, soit 20 % de la hauteur, avant même le premier contenu utile.
Le message est important — il *est* le positionnement — mais pas au point d'être
le premier tiers de l'écran, à chaque défilement vers le haut.

### M3 — le sélecteur de zone occupe toute la première vue

Quatorze boutons de zone en deux colonnes remplissent l'écran d'accueil, et
**restent dépliés après le chargement d'une zone**. Au retour d'une sortie,
l'utilisateur ouvre l'application pour voir sa progression : il tombe sur la
liste des départements d'Auvergne-Rhône-Alpes et doit faire défiler pour
atteindre son pourcentage.

### M4 — la fiche détail masque entièrement la carte

Sur bureau, la fiche est en surimpression de la carte : on garde le tracé sous
les yeux. Sur mobile, elle occupe les 40 % du bas, c'est-à-dire **toute la
carte** — on lit le détail d'un itinéraire sans jamais voir où il passe. Le
profil altimétrique lié à la carte (PR #57) perd tout son sens dans cette
disposition.

### M5 — l'état d'accueil est tronqué

Le panneau « Bienvenue sur Sentiers » s'affiche dans la zone carte et se trouve
coupé en bas : la troisième étape et le rappel de confidentialité sont hors
cadre, chevauchés par la légende et l'attribution.

### M6 — textes écrits pour la souris

« **Survolez** le profil pour situer un passage sur la carte » : il n'y a pas de
survol au doigt. Le geste existe (le graphique répond au `pointerdown`), mais la
consigne décrit une interaction qui n'a pas lieu sur téléphone.

### M7 — légende et attribution se chevauchent

En bas de carte, la légende compacte passe par-dessus la ligne d'attribution
MapLibre : les deux deviennent illisibles. Sur bureau, la hauteur disponible
évite la collision.

### M8 — polices sous 12 px

Badges de réseau à **11,5 px**, attribution à **11 px**. Lisible à 20 cm dans un
salon, moins en plein soleil avec des lunettes de soleil polarisées — le
contexte réel de l'application.

## Ce qui va déjà bien

- **Aucun débordement horizontal** (`scrollWidth` = `innerWidth` = 390).
- Les accordéons repliables existent déjà : la structure est là, il manque la
  taille des poignées et un état initial pensé pour le mobile.
- L'import par bouton fichier fonctionne sans glisser-déposer.
- La suppression demande une confirmation en deux temps, sans boîte native.
- Aucune violation axe-core sérieuse ou critique, y compris panneaux dépliés.

## Méthode, pour pouvoir refaire la mesure

Les mesures sont reproductibles : viewport 390 × 844, `isMobile`, `hasTouch`,
chargement de la zone PNR du Pilat, import d'un GPX synthétique, puis relevé des
`getBoundingClientRect` de tous les éléments interactifs. Le test
`tests/e2e/mobile.spec.ts` fige la partie vérifiable (cibles tactiles), pour que
la régression soit détectée et pas re-découverte dans six mois.
