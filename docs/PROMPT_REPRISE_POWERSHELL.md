# Reprendre Sentiers sur un PC Windows (PowerShell)

Deux parties :
- la mise en route de la machine, à faire une seule fois ;
- le prompt à coller dans Claude Code à chaque reprise.

La dernière session (locale, Windows, 22/10) s'est arrêtée au commit qui
met ce fichier à jour, sur `main` : depuis le 22/10, plus de branche longue —
une issue = une branche partie de `main` = une PR (`AGENTS.md`).
Bilan : cinq épopées ouvertes (#579 à #583), quatre closes. #578 (cadrage
de zone) et #577 (ⓘ du crédit) livrées, chacune reprise après sa revue
adverse ; #572 et le sous-point 3 de #560 trouvés déjà livrés ;
`.gitattributes`, `cross-env`, et le retrait de `libelleCompletion`.
Quatre décisions attendent Cédric (§3).

---

## 1. Mise en route (une fois par machine)

Dans PowerShell, sans droits administrateur sauf si `winget` le demande :

```powershell
winget install Git.Git
winget install jqlang.jq
winget install GitHub.cli
winget install OpenJS.NodeJS.LTS
irm https://claude.ai/install.ps1 | iex
```

Ouvrir **un nouveau terminal** pour que le `PATH` soit relu, puis :

```powershell
gh auth login
git clone https://github.com/Opaland/Rando-generator.git
cd Rando-generator
npm ci
npx playwright install chromium
claude
```

Pourquoi ces réglages, qui ne sont pas optionnels :

- **Git for Windows** : Claude Code s'en sert comme shell (Git Bash), et les
  hooks de `.claude/hooks/*.sh` en ont besoin. Sans lui, ils partiraient
  dans PowerShell et ne tourneraient pas.
- **`jq`** : les hooks lisent la commande avec. Sans `jq`, la porte avant
  commit **laisse tout passer en silence**, et le garde-fou est désactivé
  sans que rien ne le dise (CLAUDE.md §6quater). Mesuré le 19/10 : un faux
  `git commit` a été accepté en code 0, sans aucun contrôle.
- **`gh`, connecté** : le hook de démarrage lit l'état du déploiement de
  `main` avec lui, et les issues se ferment par lui. Sans `gh`, le §7 n'est
  pas vérifié.
- **Fins de ligne** : plus rien à régler depuis le 22/10. Git pour Windows
  convertit par défaut les sources en CRLF, et `npm run listes` sortait
  rouge sur un arbre propre (19/10) ; `.gitattributes` impose maintenant
  `eol=lf` à tout clone. Sur un clone déjà fait en CRLF, sur un arbre propre
  uniquement : `git rm -rq --cached .` puis `git reset -q --hard HEAD`.
- **`script-shell`** : plus nécessaire non plus. Les scripts à variable
  (`monkey`, `mesure`, `reel`…) passent par `cross-env`, que `cmd.exe`
  comprend : vérifié le 22/10, `npm run monkey` vert avec
  `npm_config_script_shell=cmd.exe`, là où `MONKEY=1 …` y rendait
  « 'MONKEY' n'est pas reconnu ». Un `script-shell` déjà posé ne gêne pas.

`PW_CHROMIUM_PATH` n'est **pas** à définir en local. `playwright.config.ts`
ne s'en sert que si elle existe, et `npx playwright install chromium`
installe le navigateur au bon endroit.

**Si `jq` ou `gh` restent introuvables dans Claude Code** alors qu'ils
répondent dans un nouveau PowerShell, c'est que le `PATH` de Claude Code
date d'avant l'installation : relancer Claude Code. Sur la machine du
19/10, deux relais dans `~/bin`, déjà dans le `PATH` de Git Bash,
pointent vers les `.exe` installés par winget.

### Vérifier avant de travailler

1. Faire un essai de commit avec une erreur de type volontaire. **Il doit
   être refusé**, avec `typecheck en échec`. S'il passe, `jq` n'est pas vu
   par le hook ; dans ce cas, lancer `claude --debug` et lire pourquoi le
   hook a échoué.
2. `/porte` doit sortir **entièrement** verte, monkey compris : plus
   aucun rouge connu sous Windows depuis le 20/10 (voir ci-dessous).
3. Pour tester sur le téléphone, lancer
   `npm run build; npm run preview -- --host`, puis ouvrir l'adresse affichée
   depuis le téléphone, sur le même Wi-Fi. Depuis #561, la page ne reste
   plus blanche sur cette origine non sécurisée. Elle n'a simplement pas
   de service worker, donc pas de hors-ligne.

### Ce qui rougissait sous Windows : #572

`terrain-sur-carte.spec.ts` et `visibilite-zoom.spec.ts:111` étaient
rouges sur l'arbre propre le 19/10. Depuis 01e991e (20/10), **plus aucun
rouge** : le 21/10, une douzaine de portes complètes sous Windows, monkey
compris, sont sorties vertes sans un échec résiduel. Une porte est donc
« verte » quand **tout** est vert ; un test rouge est à expliquer, pas à
excuser. #572 est fermée depuis le 22/10.

---

## 2. Le prompt de reprise

À coller tel quel dans Claude Code, lancé depuis le dossier du dépôt :

```text
Reprise de Sentiers sur mon PC (Windows, PowerShell, Claude Code natif
avec Git Bash). Mode de développement d'AGENTS.md : une issue = une
branche partie de main à jour = une PR (Closes #n), fusionnée en squash
seulement CI verte, après avoir remis main à jour dans la branche. Jamais
de commit direct sur main.

Avant tout :
1. git fetch et git status : arbre propre et à jour, sinon arrête-toi et
   dis-le-moi. Vérifie la CI du dernier commit de la branche et l'état
   de main (CI et GitHub Pages) — CLAUDE.md §7.
2. Relis CLAUDE.md en entier (il fait foi), puis ce fichier
   (docs/PROMPT_REPRISE_POWERSHELL.md, §1, §3 et §4), et
   docs/OPTIMISATION_TOKENS.md.
3. Vérifie que les hooks tournent : jq --version, gh auth status,
   bash --version. (Les fins de ligne ne se règlent plus : .gitattributes,
   depuis le 22/10.)

Puis, dans cet ordre :

A. Une seule question groupée (AskUserQuestion) pour les décisions du §3
   de ce fichier, recommandation en premier. AVANT de la poser, vérifie
   sur GitHub que chaque point est encore ouvert et non livré (git log,
   issue) : le 22/10, deux points sur dix étaient déjà faits. Ne commence
   aucun sprint avant mes réponses ; ce que je laisse « plus tard » reste
   ouvert.

B. Une revue courte du projet : ce qui a changé depuis le 22/10 et les
   issues ouvertes. Pas une revue globale complète (la dernière date du
   19/10) — sauf si je la demande.

C. Des EPIC + US sur GitHub (une épopée par sprint, label epic), puis des
   sprints d'une épopée au plus, selon mes réponses. Candidats :
   - #290 volet 2 (le tracé à la couleur de son balisage), si je tranche
     les questions du §3 ;
   - #584, #585 et l'US 3.2 de #581 (#296), selon mes réponses ;
   - #565 (sortie autour de minuit, UTC contre heure locale) et #566
     (95 % sans la coche « bouclé ») : bugs ouverts, à relire d'abord.

D. À la fin de chaque sprint : revue adverse (agent relecteur-adverse),
   puis démonstration sur le réseau réel avec la skill carte-reelle, au
   nom des personas concernés, et traitement des retours (corrigés avec
   un test vu rouge, ou ouverts en issue).

Méthode, sans exception (CLAUDE.md) :
- TDD sur src/core ; chaque correctif a son test vu ROUGE avant, et
  rouge de nouveau si on retire le correctif (§1).
- Mesurer ce qui est PEINT (estAlEcran, elementFromPoint) dans un
  expect.poll, à la bonne largeur, au doigt (hasTouch) sous 801 px
  (§1bis). Impression : un vrai page.pdf rendu en image (skill
  carte-reelle) — une A4 fait 794 px CSS et s'imprime en disposition
  téléphone.
- Porte complète avant tout commit qui touche src/ ou tests/ : lint,
  listes, textes, chemins, npx tsc -b --noEmit, coverage, ports, build,
  e2e, monkey. npm run build dans une commande à part ; rien ne bouge
  pendant une porte (ni source, ni test, ni Chromium de démonstration).
- Pas de prettier ; une correction de texte se fait sur toutes les
  surfaces (§3 : grep sur la formule).
- Commits en français, poussés aussitôt la porte verte ; fermer chaque
  issue par un commentaire qui cite le commit ; ne rien fermer qui
  demande une preuve humaine (§10).
- Ne prétends rien que tu n'as pas vérifié (§5).
- Un sous-agent reçoit dans son prompt ce qui lui est interdit : ni
  worktree, ni jonction vers node_modules, ni npm ci / install / build,
  rien de supprimé hors de son scratchpad (incident du 22/10).

Communication : des points d'étape COURTS — fait / en cours / attend ma
décision — à chaque fin d'étape, pas un fil continu. Je me suis perdu le
21/10 dans un flot de messages détaillés.

À la fin de la journée : revue, clôture, et mise à jour de ce fichier
avec le prompt du lendemain.
```

---

## 3. Ce qui attend la décision de Cédric

Tranché le 22/10 et codé : #578 cadre sur l'emprise de la zone
administrative (19 zones embarquées ; la Nouvelle-Calédonie, dont la
limite va des Chesterfield à Matthew–Hunter, reste cadrée sur ses
itinéraires — tranché au jugement, écrit dans le script) ; #572 fermée ;
`.gitattributes` et `cross-env` ; `libelleCompletion` retiré. La routine
cloud « Sentiers — backlog autonome » est désactivée.

Reste ouvert :

- **#290 volet 2** — le bicolore est tranché (couleur principale = le
  champ « voie » d'`osmc:symbol`), mais la carte entière est colorée **par
  réseau** : légende GR / PR / non déclaré, couleurs vérifiées en vision
  deutéranope (#335, #360), bande de terrain interdite de couleurs de
  balisage. À trancher : quelles couches passent au balisage, ce que
  devient la légende, quelle couleur sans `osmc:symbol` (5,7 %).
- **#584** — au téléphone, fiche ouverte, la bande de carte est trop
  courte : ▶ sur le « − » du zoom (390 en gros texte, 360), boussole hors
  carte, ⓘ sous « Ma position » à 320 × 480. Que fait-on céder ?
- **#585** — à 1 024 à la souris, la liste des zones s'arrête sous un
  intertitre seul. Les ombres de défilement ne s'y peignent pas (boutons
  opaques) : trois pistes sur l'issue.
- **#296** — chercher par lieu une sortie importée hors zone : les vrais
  contours des 19 zones, ~300 ko bruts à ~100 m de simplification. Le
  poids vaut-il la réponse, et à quel seuil ?
- **Rhône (#20, #87)** — datARA répond toujours 403 le 22/10 (UUID
  complet `e18f588f-1eca-4131-86ea-92985b2d8475`). **Savoie / Haute-Savoie** :
  la décision juridique reste à prendre.
- **Agent `relecteur-adverse`** — proposé : lui interdire dans sa
  définition les worktrees à jonction vers `node_modules` (voir §4).
- **Preuves humaines** — #173 (Théo et Jeanine, seuls), #528 (un vrai
  lecteur d'écran). **Non vérifié sur un vrai téléphone** : Retour qui
  ferme la fiche (#568), l'IP du réseau local (#561), le double-tap (#551).

## 4. Ce que la journée du 22/10 a appris

- **Le prompt de reprise vieillit comme un commentaire** (§4bis) : #572 et
  #560 (3) y figuraient comme à faire, livrés depuis deux jours. La
  question groupée en a tiré une décision sur une prémisse fausse, qu'il a
  fallu reposer. D'où l'étape A : vérifier avant de demander.
- **La revue adverse trouve ce que le test du correctif ne pose pas** :
  deux fois sur deux sprints, une régression dans un état voisin — la
  sortie de démonstration, le crédit déplié. Les tests du correctif ne
  regardaient que l'état réparé.
- **Une sonde jetable ment encore** (§1bis), trois fois ce jour : un lien
  coupé sur deux lignes dont le centre tombe sur le texte voisin, des
  ombres « présentes » mais peintes sous des boutons opaques, un
  `grep $''` qui comptait tout. Chaque fois, une image ou un témoin a
  tranché.
- **Un sous-agent peut abîmer le dépôt** : en retirant un worktree jetable
  dont `node_modules` était une jonction, la revue a effacé celui du dépôt
  (réparé par `npm ci`). Lui dire ce qui est interdit, dans le prompt.
- **Overpass réel** a expiré deux fois sur quatre démonstrations ; relancer
  une fois suffit. Les miroirs saturés, Nominatim rend les emprises.
