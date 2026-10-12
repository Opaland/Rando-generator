# Plan d'optimisation des tokens (12/10/2026)

Demande de Cédric : le quota Pro est épuisé dès le mercredi soir, ce qui
bloque l'avancement pour le reste de la semaine. Ce document mesure où
partent les tokens dans le fonctionnement actuel de cette session, et
propose des changements concrets — pas des généralités sur « être plus
concis ».

Rien ci-dessous n'est deviné : chaque chiffre vient d'une mesure faite sur
ce dépôt le 12/10 (`wc`, lecture directe des hooks et de `settings.json`,
observation d'un événement réel survenu dans cette session même).

---

## 1. Ce qui coûte vraiment, mesuré

### 1.1 Toute édition de `CLAUDE.md` (ou `README.md`) en cours de session recharge le fichier entier

**Constat direct** : en corrigeant la garde `og-image` plus tôt dans cette
session, l'édition d'un seul paragraphe de `CLAUDE.md` a déclenché un
rechargement complet du fichier dans le contexte — **23 462 octets, ~460
lignes, environ 6 000 tokens** pour un changement de trois phrases. C'est
visible directement dans la transcription de cette session : un
`<system-reminder>` a réinjecté l'intégralité du fichier après l'édition.

`README.md` (plus petit mais même mécanisme) et tout autre fichier
d'instructions suivi par le harnais a le même coût à chaque modification.

**Levier** : regrouper les corrections de `CLAUDE.md`/`README.md` plutôt
que de les faire une par une au fil des sprints. Un sprint qui touche trois
fois ces fichiers paie trois fois 6 000 tokens ; les trois changements
groupés en une seule édition paient une fois.

### 1.2 La porte complète (§6) duplique une partie de ce que le hook fait déjà

`.claude/hooks/porte-avant-commit.sh` relance automatiquement **lint,
listes, textes, chemins, typecheck et les tests unitaires** à chaque
tentative de `git commit` — et bloque le commit avec le détail de l'échec
si l'un d'eux est rouge.

Dans cette session, ces six commandes sont systématiquement relancées **à
la main avant** de committer, en plus de leur exécution automatique par le
hook. Ce n'est pas inutile — avoir l'échec avant de proposer le commit
évite un aller-retour — mais c'est une duplication complète de six
commandes sur six, pour un gain qui se limite à éviter un seul message
d'échec du hook.

**Levier** : pour les six commandes couvertes par le hook, ne les lancer à
la main que lorsqu'un échec est plausible (après avoir touché le fichier
concerné) plutôt que systématiquement avant chaque commit. Le hook reste le
filet de sécurité réel ; le laisser faire son travail au lieu de le
précéder à l'identique économise ces six exécutions à chaque item.
**Coverage, build, e2e et monkey restent hors hook** (le commentaire du
hook explique pourquoi : « les mettre ici rendrait chaque commit
insupportable ») — ceux-là, personne d'autre ne les vérifie, donc ceux-là
se lancent à la main.

### 1.3 Le e2e et le monkey sont relancés en entier même pour un changement qui ne touche pas l'application servie

L'item en cours au moment de cette demande (garde `og-image`) ne modifie
que `scripts/jumelles/11-playwright.mjs`, `README.md` et `CLAUDE.md` —
aucun fichier sous `src/`. La porte e2e+monkey complète a quand même été
relancée, parce que §6 ne prévoit pas d'exception.

**Mesuré sur cette session** : une porte e2e+monkey complète tourne de
l'ordre de 10 à 15 minutes et produit, même en ne lisant que les dernières
lignes du journal, plusieurs passages de lecture de journal dans le fil
principal.

**Levier, à trancher par Cédric (ce n'est pas un seuil à inventer, §2)** :
une commande qui ne touche ni `src/`, ni `tests/e2e/`, ni le build, ne peut
pas faire varier un résultat e2e — y faire tourner e2e quand même vérifie
une hypothèse déjà vraie par construction. Deux options :
- garder §6 tel quel (coût connu, zéro risque de laisser passer une
  régression inattendue) ;
- ajouter une exception explicite et écrite : un commit dont le diff ne
  touche que `docs/`, `README.md`, `CLAUDE.md` ou `scripts/jumelles/` (les
  gardes elles-mêmes, pas le code servi) peut committer sur lint + listes +
  textes + chemins + typecheck seuls, sans coverage/build/e2e/monkey.

Je n'ai pas pris cette décision à votre place : cette session continue de
lancer la porte complète tant que vous n'avez pas tranché.

### 1.4 Une session continue sur plusieurs jours paie le réchauffement du cache à chaque reprise

Cette session a été reprise à plusieurs jours d'écart (08/10 puis 12/10).
Le cache de contexte de ce type de session a une fenêtre d'environ une
heure : au-delà, la reprise d'une conversation ancienne retraite l'historique
accumulé au tarif plein plutôt qu'au tarif cache, et plus la session est
longue au moment de la reprise, plus cette facture est grosse — c'est un
effet mécanique de combiner continuité de conversation et coupures de
plusieurs jours, pas une négligence côté outillage.

**Levier** : pour un travail qui reprend après une coupure de plus d'une
heure (donc typiquement le lendemain), démarrer une session neuve avec un
résumé d'une à deux pages (ce que ce document fait déjà pour le sujet
« tokens », et ce que `docs/FEUILLE_DE_ROUTE.md` fait pour le backlog) coûte
une fraction de ce que coûte la relecture complète de l'historique accumulé.

### 1.5 Les gros documents du dépôt, relus en entier plutôt qu'en extrait

`docs/PERSONAS.md` (530 lignes, ~26 Ko), `docs/SPRINTS_25_08.md` (740
lignes, ~35 Ko), `docs/FEUILLE_DE_ROUTE.md` (253 lignes) : une lecture
complète de l'un de ces fichiers pour vérifier un seul fait (comme la
section Léa de PERSONAS.md plus tôt dans cette session) coûte largement
plus qu'un `grep` ciblé suivi d'une lecture de 15-20 lignes autour du
résultat.

**Levier, déjà appliqué partiellement dans cette session** : systématiser
`grep -n` avant tout `Read` d'un fichier de plus de 200 lignes quand la
question porte sur un fait précis plutôt que sur la structure d'ensemble.

---

## 2. Ce qui ne change rien (mesuré, pas supposé)

- **Déléguer à un agent (`Agent` tool) ne réduit pas le total de tokens
  consommés sur le compte** — un agent a son propre contexte, qui se
  reconstruit en partie depuis zéro (relecture de fichiers déjà lus dans le
  fil principal). Ça protège le fil principal d'un historique qui grossit
  (donc ça limite le coût de *relecture* future), mais ce n'est pas une
  économie nette si la tâche est petite et connue : le déclenchement d'un
  agent a un coût fixe que le fil principal n'a pas.
  → les agents valent leur coût pour une exploration ouverte dont le
  résultat brut (beaucoup de grep/read) n'a pas besoin de rester dans le
  contexte principal ensuite — pas pour une tâche mécanique de trois
  lignes.
- **La compression automatique de l'historique** (déjà active dans ce
  harnais) fait déjà ce qu'elle peut faire sans perte de fidélité ; lui
  demander d'intervenir plus souvent ne réduit pas le volume total lu, elle
  déplace seulement le moment où il est relu une dernière fois avant d'être
  résumé.

---

## 3. Plan retenu

| # | Action | Qui décide | Coût pour l'économiser |
|---|---|---|---|
| 1 | Grouper les éditions de `CLAUDE.md`/`README.md` par sprint plutôt qu'au fil de l'eau | moi, pratique immédiate | ~6 000 tokens évités par édition groupée |
| 2 | Ne plus relancer à la main lint/listes/textes/chemins/typecheck/tests avant un commit couvert par le hook ; les lancer seulement si le fichier concerné a été touché | moi, pratique immédiate | 6 commandes par item |
| 3 | Exception e2e/monkey pour les commits qui ne touchent que `docs/`/gardes (§1.3) | **à trancher par Cédric** | ~10-15 min de porte par item concerné |
| 4 | Sessions neuves après une coupure de plus d'une heure, avec un résumé écrit en handoff | Cédric (habitude de travail) | le plus gros poste, proportionnel à la durée d'inactivité avant reprise |
| 5 | `grep` ciblé avant `Read` complet sur tout fichier de plus de 200 lignes | moi, pratique immédiate | variable, mais systématique |
| 6 | Réserver les agents à l'exploration ouverte, pas aux tâches mécaniques connues | moi, pratique immédiate | évite le coût fixe de déclenchement sans contrepartie |

Les actions 1, 2, 5, 6 sont appliquées dès cette session, sans qu'il y ait
besoin de les demander à nouveau. L'action 3 attend une décision écrite
(un mot suffit : « oui » ou « non » sur l'exception proposée au §1.3).
L'action 4 est une question d'habitude de travail plutôt que de réglage :
la proposition concrète est de clore une session en fin de sprint avec un
état écrit (ce que `docs/FEUILLE_DE_ROUTE.md` et les tâches de suivi font
déjà), et d'en ouvrir une neuve à la reprise plutôt que de rouvrir
celle-ci après une nuit ou plus.

### Option écartée : étaler le travail par une tâche planifiée (Routine)

Une tâche planifiée (ScheduleWakeup / Routine) qui relancerait un sprint
chaque jour **ne réduit pas le total de tokens consommés dans la semaine**
— elle ne fait que répartir la même consommation sur plus de jours. Ça
peut éviter de tout brûler en un ou deux jours si c'est le vrai problème,
mais ce document mesure que le vrai problème est ailleurs (§1) : réduire
d'abord ce qui est gaspillé, et seulement ensuite décider s'il reste besoin
d'étaler le reliquat. Je ne mets pas en place de planification automatique
sans un cran de confirmation explicite — une Routine qui pousse des commits
seule, sur plusieurs jours, dépasse ce qu'« être autonome » devrait couvrir
sans un mot de confirmation.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0154ZRyRPiim5MLBEbLCNbw3
