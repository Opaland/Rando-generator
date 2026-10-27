# Reprendre Sentiers sur un PC Windows (PowerShell)

Deux parties :
- la mise en route de la machine, à faire une seule fois ;
- le prompt à coller dans Claude Code à chaque reprise.

La dernière session (cloud, 27/10) s'est arrêtée sur `main`, une fois
fusionnée la PR qui met ce fichier à jour. Une issue = une branche partie de
`main` = une PR (`AGENTS.md`).
Bilan du 27/10 : #620, #621, #622 fusionnées ; #585 (#623), #591 (#625),
#593 (#626) corrigées et fermées ; #584 en partie (#624, boussole effacée
fiche ouverte — l'issue reste ouverte, voir le §3) ; #615 (#627) **à
fusionner si sa CI est verte** — vérifier à la reprise. Quatre décisions
prises le matin (#594, #290, #608, #584/#591/#593), notées sur leurs
issues.

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
1. git checkout main, git pull, git status : arbre propre et à jour,
   sinon arrête-toi et dis-le-moi. Vérifie l'état de main (CI, image de
   production, GitHub Pages) — CLAUDE.md §7 — et les PR encore ouvertes.
2. Relis CLAUDE.md en entier (il fait foi, AGENTS.md compris), puis ce fichier
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

B. Une revue courte du projet : ce qui a changé depuis le 27/10 et les
   issues ouvertes. Pas de revue globale : la dernière date du 26/10
   (docs/REVUE_GLOBALE_26_10.md).

C. Les issues retenues, une par une, chacune sur sa branche et sa PR.
   Candidats, par ordre de gravité, à confirmer par mes réponses :
   - #627 (#615) : la fusionner si la CI est verte sur un commit qui
     contient main ;
   - décidés le 27/10, à coder : #594 volet 2 (ne jamais replier l'unique
     GR d'une zone), #290 volet 2 (la balise dessinée dans chaque ligne de
     la liste ; la carte garde la taxonomie), #608 (« marchand » = hôtels
     et campings commerciaux : corriger le texte, pas le code) ;
   - les textes #602 à #608, groupés par surface ;
   - #296 (contours à ~100 m, mesurer d'abord), décidé le 22/10 ;
   - #587 (Chromium qui cale en CI) : mesurer avant de corriger.

D. Pour une question d'écran, l'agent ines ; pour une démonstration ou
   « est-ce que X y arrive ? », l'agent parcours avec la persona nommée ;
   après chaque PR qui touche src/, l'agent relecteur-adverse. Leurs
   « Questions à choix » me sont posées par AskUserQuestion ; leurs
   défauts sont corrigés avec un test vu rouge, ou ouverts en issue.

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

Tranché le 27/10 (à coder, voir le §2) : #594 volet 2, #290 volet 2,
#608. Livré le 27/10 : #585, #591 (élargi à **25 km**, pas 20 — la valeur
retenue ce jour-là), #593, #584 en partie, #615 (PR #627).

Reste ouvert :

- **#584, la suite** — trois cas mesurés, à trancher : à 320 × 480 le ⓘ
  replié sous « Ma position » ; à 360 × 640, fiche **fermée**, la carte
  d'itinéraire recouvre la boussole (195-239 px, CI) ; et le coût de la
  boussole effacée : une carte tournée avant d'ouvrir la fiche n'a plus de
  retour au nord simple (« Incliner » puis « Remettre à plat », rien au
  clavier). Remettre le nord à l'ouverture de la fiche au téléphone ?
- **#615, deux réserves** de la relecture (non mesurées) : le focus tombe
  sur `body` après « Compris » (comme après « Quitter ») ; feuille repliée
  au téléphone, l'avis est monté mais caché.
- **#593, une limite écrite** : un corridor à cheval sur deux territoires
  n'est jugé que sur son départ ; la carte elle-même ne dit rien de son
  fond vide.
- **Rhône (#20, #87)** — datARA 403 le 22/10 ; **Savoie / Haute-Savoie** :
  décision juridique.
- **Clé d'API** collée le 22/10 dans la conversation : à révoquer.
- **`fs.rmSync` sous un chemin accentué** (#612) : le signaler à Node, ou
  vérifier une version plus récente ?
- **Preuves humaines** — #173, #528 ; non vérifié sur un vrai téléphone :
  #568, #561, #551.

## 4. Ce que la journée du 27/10 a appris

- **La relecture adverse a trouvé un défaut réel sur quatre PR sur
  cinq**, et chaque fois là où le diff paraissait fini : un vide de 10 px et
  un chevron nu en contraste élevé (#585) ; des 12 km vides affichés,
  enregistrés puis laissés à l'écran par une annulation (#591) ; une tuile
  témoin qui n'était pas celle du départ, un 404 gardé 21 jours en cache,
  un téléchargement orphelin (#593). Le cinquième (#615) n'a donné que des
  réserves. Elle se lance **avant** de fusionner, pas après.
- **Une ligne de grille ne descend pas sous zéro** : une marge négative
  sur un élément de grille ne rend pas le gap qui le précède (#585). Le
  commentaire qui disait « hors du flux » affirmait sans mesurer (§4bis).
- **Un test peut être trop fort** : « la boussole est peinte par
  elle-même » à la fermeture de la fiche a rougi en CI sur un recouvrement
  antérieur, sans lien avec le correctif (#584). Un test affirme ce que la
  PR garantit ; le reste se signale sur l'issue.
- **Une dépendance d'effet doit être une valeur** : la fiche passe un
  tableau neuf à chaque rendu ; un `useEffect` sur ce tableau aurait sondé
  l'IGN à chaque rendu (#593). Trouvé en corrigeant, pas par un test.
- **Les plafonds de lignes ont encore guidé la forme** : `trancheZone.ts`
  (479 / 480) et `appStore.ts` (1 104 / 1 105) ont poussé la logique vers
  `src/core` (`rejouerAutour`) et vers la tranche (`DEMONSTRATION_AU_REPOS`)
  plutôt que de relever le chiffre.
- **Un échec seulement local n'est pas un échec du diff** : 390 × 844 en
  gros texte rougissait ici et pas en CI (polices). Vérifié sur `main` sans
  le diff avant de le dire.

## 4bis. Ce que la journée du 26/10 a appris

- **La cause qu'une issue avance se mesure avant de se coder** : #612
  disait « `emptyOutDir: true` probable ». Essayé, le témoin survivait. La
  vraie cause était `fs.rmSync`, qui ne supprime rien sans erreur sous
  « Moretti Cédric ». Elle a été trouvée en isolant chaque hypothèse sur
  un fichier témoin, pas en relisant Vite.
- **La relecture adverse a encore trouvé le chemin voisin** : le tracé à la
  main écrivait en base pendant la démonstration, comme la déclaration
  (#600). Trois sprints sur trois, maintenant.
- **Un plafond sert le jour où il gêne** : #601 dépassait celui du store de
  neuf lignes. La logique est allée dans sa tranche plutôt que de relever
  le chiffre.
- **Le hook « dist/ à jour » a refusé deux fois** une e2e lancée sur un
  build raté. C'est la même famille que celle du 22/10 (§6quater), et cette
  fois la garde a tenu.
- **Fusionner deux PR vertes demande de remettre main entre les deux** :
  `gh pr update-branch` le fait côté GitHub, sans toucher à l'arbre local
  pendant une porte.

## 5. Ce que la journée du 22/10 a appris

- **Le prompt de reprise vieillit comme un commentaire** (§4bis) : #572 et
  #560 (3) y figuraient comme à faire, livrés depuis deux jours. D'où
  l'étape A : vérifier avant de demander.
- **La revue adverse trouve ce que le test du correctif ne pose pas** :
  deux fois sur deux sprints, une régression dans un état voisin (la sortie
  de démonstration, le crédit déplié).
- **Un vert local peut tenir aux polices** : le test de #584 passait sous
  Windows et rougissait sous Linux à 360 px. C'est une sonde parlante
  (« sous locate-toggle (151-195 px) ») qui l'a dit, pas un booléen.
- **Une sonde jetable ment encore** (§1bis) : un lien coupé sur deux
  lignes, des ombres peintes sous des boutons opaques, un `grep` du
  caractère CR qui comptait tout. Chaque fois, une image ou un témoin a
  tranché.
- **Un sous-agent peut abîmer le dépôt** : un worktree jetable à jonction
  a effacé `node_modules`. Les interdits sont maintenant écrits dans
  `AGENTS.md` et dans les agents.
- **Les agents-personas trouvent ce que les bouchons cachent** : le
  parcours de Zoé sur le réseau réel a rendu six défauts en une passe, et
  Inès a corrigé l'issue même qu'on lui soumettait.
- **Une PR peut contenir le défaut qu'elle combat** : `AGENTS.md` et
  `CLAUDE.md` écrivaient chacun l'exception « docs seuls », déjà
  divergentes le jour de leur naissance (§4ter) — vu par la revue globale,
  corrigé avant la fusion.
- **Overpass réel** expire souvent ; relancer une fois. Les miroirs
  saturés, Nominatim rend les emprises.
