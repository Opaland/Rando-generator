# Routine PDIPR — apprentissages

**Lu en premier, avant toute autre action de la routine.** Chaque entrée
vient d'une erreur réelle, datée ; la routine en ajoute une à chaque échec
(et à chaque piège évité de justesse), en fin de passage, dans la PR du jour.

Format : `AAAA-MM-JJ — département — ce qui s'est passé → ce qu'on fait désormais`.
Une entrée qui se révèle fausse se **barre** avec la date et la raison, elle
ne s'efface pas (CLAUDE.md §4bis).

## Les leçons de départ (Isère 18/10, Ain 21/10, Rhône 09/11)

- 2026-10-18 — Isère — l'export plaçait 2 102 tronçons au large de
  l'Afrique, en coordonnées WGS84 « valides » → toujours mesurer l'emprise
  réelle des points avant d'écrire l'`Emprise` de `src/core/pdipr.ts`, et
  compter ce qu'elle écarte.
- 2026-10-18 — Isère — data.gouv.fr coupait les connexions → on n'embarque
  pas un jeu qu'on n'a pas lu ; un portail injoignable n'est pas un échec
  d'implémentation (voir « Ce qui n'est pas un échec » dans `ROUTINE.md`).
- 2026-10-21 — Ain — le jeu marquait 3 boucles non diffusables → lire
  **tous** les attributs du jeu avant d'en retenir ; un champ de diffusion
  ou de classement se traduit en `retenir` dans `JEUX_PAR_ZONE`, ou se
  signale à Cédric s'il change ce qui est montré.
- 2026-10-18 — Savoie, Haute-Savoie — condition « utilisation libre sous
  réserve de mentionner la source » : pas une licence nommée → décision
  juridique de Cédric, jamais tranchée par la routine.
- 2026-11-09 — Rhône — datARA rendait 403 sur l'export par panier ; le jeu
  est arrivé par courriel, en shapefile Lambert-93, métadonnées vides → le
  chemin shapefile existe (`src/core/shapefile.ts`, `src/core/lambert93.ts`,
  `exportBrut` dans `scripts/sources-pdipr.mjs`) : le réutiliser, ne pas
  réécrire de lecteur. Contrôler la projection en recoupant deux
  conversions indépendantes (le script et un calcul à part) : les mêmes
  nombres de lignes et de Ko.
- 2026-11-09 — Rhône — `tests/unit/reseauDeFond.test.ts` et
  `tests/unit/pdipr.test.ts` prenaient le Rhône comme « zone sans PDIPR » →
  avant d'ajouter un département, `grep -rn "'<id>'" tests/` : un test qui
  s'en sert comme exemple négatif doit en prendre un autre encore non couvert.
- 2026-11-09 — Rhône — `tests/unit/creditsDesSources.test.ts` épingle les
  deux chaînes d'attribution au caractère près → un nouveau crédit dans
  `src/components/map/style.ts` se reporte dans **les deux** chaînes du test.
- 2026-11-09 — Rhône — `git checkout -- fichier` ne restaure pas un
  fichier **non suivi** : après une mutation §1 sur un fichier neuf, remettre
  la ligne à la main et `grep` qu'elle est revenue.
- 2026-08 → 11 — tous — une mutation `sed` qui contient `&&` ou `&` ne
  s'applique pas comme on croit → faire les mutations §1 en Python, et
  vérifier par `grep` que le texte muté est bien présent avant de lancer.
- 2026-08-25 — tous — `npm run build` et Playwright dans **deux** commandes
  séparées (le hook refuse un `dist/` périmé), `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`,
  et l'arbre ne bouge pas tant qu'une porte tourne.
- 2026-11-09 — Rhône — surfaces de texte d'un nouveau PDIPR, toutes à
  toucher (§3) : `README.md` (liste des sources **et** paragraphe des
  zones **et** arbre des fichiers), `docs/PRD.md` (ligne #87),
  `docs/PERSONAS.md` (« Reste ouvert »), `docs/FEUILLE_DE_ROUTE.md` (item #87), `src/components/DonneesEtLicences.tsx`,
  `src/store/sourcesLocales.ts`, `src/lib/attribution.ts`.
- 2026-11-10 — Rhône — `npx prettier --write` a réécrit deux fichiers en
  guillemets doubles et points-virgules : le dépôt n'a **pas** de
  configuration Prettier, l'outil invente donc un style → ne jamais lancer
  `prettier` ; écrire dans le style des fichiers voisins (apostrophes
  simples, sans point-virgule), et `npm run lint` fait foi.
- 2026-11-10 — Rhône — `plafondDesComposants.test.ts` : un département de
  plus dans « Données et licences » ajoute ~14 lignes → ils vivent dans
  `src/components/ReseauxDepartementaux.tsx`, qui lit le crédit de
  `src/lib/attribution.ts` ; y ajouter une entrée, ne pas recopier le lien.
- 2026-11-10 — Rhône — la PR s'est arrêtée la veille sans être poussée, et
  rien ne l'a dit → un passage ne se termine jamais avec du travail non
  poussé : en fin de passage, `git status` propre, ou une branche poussée
  et une PR brouillon qui dit où on en est.
- 2026-11-10 — Rhône — la relecture adverse a trouvé trois défauts que la
  porte verte laissait passer : `docs/FEUILLE_DE_ROUTE.md` disait encore le
  département bloqué, un lecteur de fichier bouclait sans fin sur une
  longueur négative, deux surfaces ne donnaient pas le même compte (objets
  du fichier contre lignes) → la relecture adverse n'est pas facultative ;
  ajouter `docs/FEUILLE_DE_ROUTE.md` aux surfaces de texte ; nommer
  toujours **ce qu'on compte** (objets, lignes, km) à côté du nombre.
