# Ce que Sentiers peut prendre au dépôt Netatmo — étude du 10/11

Demande de Cédric (10/11) : lire en entier le dépôt Opaland/netatmo — sa façon
de travailler, sa CI, ses données —, voir ce dont Sentiers peut s'inspirer, si
Claude ou des API peuvent y entrer, et dire ce qu'il faudrait renseigner
(variables, secrets).

Lu sur un clone du 10/11 (dernier commit de `main` à cette date). Les chemins
du dépôt Netatmo sont écrits sans guillemets de code : ils n'existent pas ici,
et `npm run chemins` ne garde que ceux de Sentiers.

## En une phrase

Les deux dépôts ont la même culture — apprentissages datés, porte, règle
jumelle, « tout texte lu est une donnée » — mais Netatmo a **outillé** trois
choses que Sentiers fait encore à la main : la porte en une commande, la
surveillance des sources publiques, et Claude dans la CI et dans le produit,
sous des gardes précises.

## Ce que Netatmo fait et que Sentiers ne fait pas

Mesuré : Sentiers a 3 workflows (`ci.yml`, `deploy.yml`, `image.yml`), aucun
`schedule:`, aucun secret, ni Dependabot ni modèle d'issue ou de PR. Netatmo a
12 workflows, dont 3 planifiés (la collecte, le relevé horaire, le
balayage e2e de nuit).

| # | Chez Netatmo | Ce que ça apporterait à Sentiers | Coût | Qui décide |
|---|---|---|---|---|
| 1 | **La porte lit ses étapes dans ci.yml** (scripts/porte.mjs, #361) : une commande, l'ordre de la CI, arrêt à la première étape rouge, `--rapide` avant commit | Sentiers n'a pas de commande de porte dans le dépôt : la skill `porte` la décrit et chaque session la retape. La routine PDIPR quotidienne en a besoin dès ce soir — un script de brouillon ne survit pas à une session neuve | Un script, ~100 lignes | Mécanique : **#667** |
| 2 | **Les sources publiques testées pour de vrai** (sources.yml, #363) : marqueur `reseau` hors CI bloquante ; injoignable = ignoré, format changé = rouge, **une issue s'ouvre** (une seule tant que l'échec dure) | Sentiers dépend d'Overpass, de la Géoplateforme IGN, de l'API Adresse, des exports PDIPR (Isère, Ain) et de datARA. L'Isère a déjà livré un export reprojeté de travers, datARA est passé à 403 : chaque fois, on l'a appris par hasard | Un workflow + un fichier de tests réseau | Mécanique : **#669** ; la cadence (hebdomadaire ?) est à Cédric |
| 3 | **Fuzz à graine fixe** des entrées non sûres (web/src/fuzz.test.ts, #359) : valeurs biaisées vers les vraies formes et vers l'inattendu (`__proto__`, NaN, 1e308, demi-paire UTF-16…), le cas fautif rejouable par sa graine | Sentiers lit des fichiers qu'il n'a pas écrits : GPX, GeoJSON importé, sauvegarde, réglages relus, shapefile. Aucun fuzz aujourd'hui | Un fichier de test | Mécanique : **#670** |
| 4 | **Dependabot** (npm hebdomadaire groupé, actions mensuel, étiquette `dette`) | Les dépendances bougent seules, en une PR par semaine | Des PR à fusionner chaque semaine | **Cédric** : déjà ouverte en **#663** ; du bruit de PR en échange de la fraîcheur |
| 5 | **Balayage e2e complet la nuit** (e2e-complet.yml, 02 h 17) ; un sous-ensemble à chaque poussée | La CI de Sentiers passe toute la suite e2e à chaque poussée (~15 min, 532 tests le 10/11) | Réorganiser la suite | **Cédric** : vitesse de CI contre couverture par poussée |
| 6 | **Modèles d'issue et de PR** | AGENTS.md exige « constat, scénario, impact » : un modèle le pose d'office | Deux fichiers | Mécanique, mais faible gain |
| 7 | **Test des chiffres de la documentation** (doc-chiffres.test.ts) | Sentiers a déjà `listes`, `textes` et `chemins`, plus serrés : rien à prendre | — | — |

## Claude dans Sentiers : trois places, de la plus sûre à la plus délicate

Chiffres de l'API (référence de l'outil, cache du 03/11) : Claude Opus 5.5
(`claude-opus-5-5`), 4 $ par million de jetons en entrée, 20 $ en sortie.
C'est le modèle par défaut, et celui qu'utilise déjà Netatmo.

### A. Une revue par agents dans la CI, à la demande — le plus sûr

Netatmo : revue-agents.yml. Ce qui en fait une bonne pratique, et qu'il
faudrait garder tel quel :

- déclenchement **manuel** seulement ;
- l'agent ne peut que **lire** le dépôt (`contents: read`), avec une liste
  fermée d'outils (lecture, `git diff/log/show`, écriture d'un seul fichier de
  constats) ;
- **un seul secret**, `ANTHROPIC_API_KEY`, donné à cette seule étape ;
- les issues sont ouvertes par un **second job, sans le modèle ni la clé**,
  par un script fixe qui valide chaque champ ; le validateur est copié hors
  du dépôt avant que l'agent n'y écrive.

Pour Sentiers, ce serait la `relecteur-adverse` et l'`auditeur-ui` lancés
depuis GitHub au lieu d'une session. Rien n'y touche aux données des
utilisateurs : il n'y en a aucune dans le dépôt.

**À renseigner** : le secret `ANTHROPIC_API_KEY` du dépôt (Settings →
Secrets and variables → Actions), saisi par Cédric (AGENTS.md, Sécurité).
Ordre de grandeur, estimé et non mesuré : une revue de diff lit quelques
centaines de milliers de jetons, soit un à quelques dollars par passage.

### B. Un bilan de saison écrit par Claude — utile, mais contre la promesse actuelle

Netatmo : collector/insights.py. Son principe est exactement le §2 de
CLAUDE.md appliqué à un modèle : **le code calcule chaque nombre, le modèle
n'écrit que le texte autour, et chaque nombre du texte est revérifié contre
les faits** (une phrase portant un nombre inconnu est rejetée). Les pièces
partent sous pseudonyme, jamais de nom, d'adresse ni de série quotidienne ;
le coût de chaque analyse est stocké et affiché ; tout est facultatif.

Pour Sentiers : « En 2026, 412 km sur 38 sorties, 61 % du GR 7 dans le
Pilat… » — un récit de saison ou de sortie, chiffres pris dans l'historique.
Estimation : quelques milliers de jetons, soit quelques centimes par bilan.

Mais trois obstacles, dont un de principe :

1. **Sentiers promet que rien ne sort de l'appareil.** Netatmo le peut parce
   qu'il a un collecteur côté GitHub Actions ; Sentiers est un site statique
   sans serveur. Envoyer des agrégats à Anthropic serait une **exception
   nouvelle à la promesse**, à écrire partout où elle est faite (§3).
2. **La clé ne peut pas être dans le site** : tout ce que GitHub Pages sert
   est public. Il faudrait que chaque utilisateur colle **sa propre clé**,
   gardée sur son appareil, et que le navigateur appelle l'API directement —
   donc ouvrir la politique de sécurité (`deploy/csp.conf`) à
   `api.anthropic.com`.
3. Le bilan sans Claude est déjà faisable : les chiffres existent. Le texte
   est la seule chose que Claude ajouterait.

### C. Claude pour préparer les données — déjà en place

La routine PDIPR quotidienne (`docs/routine-pdipr/ROUTINE.md`) est déjà
Claude au travail sur les données : trouver un jeu, le lire, le reprojeter,
le vérifier. Rien à ajouter ici.

## Autres API ouvertes qui serviraient un « site qui parle des randos »

Toutes sans clé ni compte, déjà dans l'esprit du projet. Aucune n'est essayée
ici : ce sont des pistes, pas des mesures.

- **Météo du jour sur la zone** : Open-Meteo, que Netatmo appelle déjà
  (coordonnées arrondies à ~1 km). Pour Sentiers, la météo d'une sortie
  prévue. Mais c'est une requête de plus vers un tiers, qui révèle la zone
  regardée : à ajouter à la liste de « ce qui sort ».
- **Les PDIPR** : la routine en ajoute un par jour.
- **Geotrek** (le Parc du Pilat, #88) : bloqué sur la licence, toujours.

## Vérifié sans y trouver de défaut

**Origine partagée** — l'apprentissage A1 de Netatmo : tous les sites du
compte `opaland.github.io` partagent la même origine, donc le même
`localStorage`, la même IndexedDB, le même cache du service worker. Vérifié
pour Sentiers :

- sa base s'appelle `sentiers` (`src/db/database.ts`) ;
- ses réglages sont préfixés `sentiers.reglage.` (`src/db/reglages.ts`) ;
- ses caches s'appellent `sentiers-…`, et son service worker ne supprime que
  les siens (`public/sw.js`, filtre sur `PREFIXE_APP`).

Netatmo, de son côté, ne vide que ses propres caches (web/src/pwa.ts,
`cachesToClear`). Les deux cohabitent. Le risque reste pour une application
future du compte qui viderait **tous** les caches.

**Monkey hors CI** — la porte de Sentiers lance `monkey`, la CI non. C'est
voulu et écrit (`tests/e2e/monkey.spec.ts` : « exploratoire, hors CI »).

## Ce qu'il faut renseigner — réponse courte

| Quoi | Où | Pour quoi | Obligatoire ? |
|---|---|---|---|
| Révoquer la clé d'API collée dans la conversation le 22/10 | console Anthropic | Sécurité (`docs/PROMPT_REPRISE_POWERSHELL.md`, §3, encore ouvert) | **Oui, à faire de toute façon** |
| `ANTHROPIC_API_KEY` | Secrets du dépôt GitHub | La revue par agents (A) | Seulement si A est retenue |
| Rien d'autre | — | Les pistes 1 à 3 et 5 à 6 n'utilisent aucune clé | — |

## Questions à choix, pour Cédric

1. La revue par agents dans la CI (A) : la mettre en place, avec un secret
   neuf ? — **oui** / non / plus tard.
2. Le bilan écrit par Claude (B) : ouvrir une exception à « rien ne sort »,
   avec la clé de chacun ? — non, garder la promesse (**recommandé tant que
   personne ne l'a demandé**) / oui, en option désactivée par défaut.
3. Dependabot (4, #663) : une PR de dépendances par semaine ? — oui / non.
4. La suite e2e (5) : tout à chaque poussée comme aujourd'hui, ou un
   sous-ensemble et le tout la nuit ? — garder / changer.
