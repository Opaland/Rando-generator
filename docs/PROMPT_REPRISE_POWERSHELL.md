# Reprendre Sentiers sur un PC Windows (PowerShell)

Deux parties :
- la mise en route de la machine, à faire une seule fois ;
- le prompt à coller dans Claude Code à chaque reprise.

La dernière session (locale, Windows, 22/10) s'est arrêtée sur `main`, une
fois fusionnée la PR qui met ce fichier à jour. Depuis le 22/10, plus de
branche longue : une issue = une branche partie de `main` = une PR
(`AGENTS.md`).
Bilan du 22/10 : #578 et #577 livrées, #584 en partie ; la branche longue
fusionnée sur `main` (#586) ; le mode de développement d'ISTQBFinder mis en
place (#588 agents `ines` et `parcours`, #589 permissions, #590
`AGENTS.md` et intégrations Copilot / Gemini) ; une revue globale
(`docs/REVUE_GLOBALE_22_10.md`) ; 20 issues ouvertes par les agents et la revue (#591 à #596, #600 à #613).

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

B. Une revue courte du projet : ce qui a changé depuis le 22/10 et les
   issues ouvertes. Pas de revue globale : la dernière date du 22/10
   (docs/REVUE_GLOBALE_22_10.md).

C. Les issues retenues, une par une, chacune sur sa branche et sa PR.
   Candidats, par ordre de gravité, à confirmer par mes réponses :
   - #600 (déclarer pendant la démonstration écrit en base — test d'abord)
     et #601 (une fiche « ouverte » survit au changement de zone) ;
   - #592 (zone vide qui ne recadre pas) et #594 (légende qui annonce un GR
     non dessiné) : correctifs mesurables, sans décision ;
   - #612 (dist/ jamais vidé) et #613 (npm audit) : outillage ;
   - les textes #602 à #608, groupés par surface ;
   - #585 (fondu + chevron, avis d'Inès) et #296 (contours à ~100 m,
     mesurer d'abord), décidés le 22/10 ;
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

Tranché le 22/10 : #584 (▶ s'efface fiche ouverte — livré ; reste le cas
360 px), #585 (fondu — Inès recommande d'y peindre un chevron), #296
(contours acceptés, ~100 m, mesurer avant de livrer), le mode
d'ISTQBFinder (livré : #588, #589, #590).

Reste ouvert :

- **#585** — trois questions d'Inès (sur l'issue) : chevron dans le fondu
  ou dégradé seul ; partout ou seulement 800-1 100 px ; corriger dans le
  même lot la marge invalide `-var(--espace-2)` de `.groupTitle`.
- **#584, cas 360 px** — la bande au-dessus de la fiche fait 260 px (130
  en gros texte), le zoom seul 132 : boussole sous « Ma position », et le
  « − » aussi selon les polices (Linux). Que fait-on céder encore ?
- **#290 volet 2** — couches, légende, couleur sans `osmc:symbol`.
- **#591** — le rayon de « autour d'une ville » (12 km, 0 itinéraire à
  Nouméa ; 8 à 20 km) : il change ce qui est calculé (§2).
- **#593** — fond de carte hors couverture IGN (Nouvelle-Calédonie dès le
  zoom 8) : un autre fond, ou le dire à l'écran.
- **#594, volet 2** — replier les GR quand ils sont la majorité d'une zone
  (décision du 25/08 à revoir).
- **#608** — qu'appelle-t-on « hébergement marchand » (gîtes d'étape) ?
- **Rhône (#20, #87)** — datARA 403 le 22/10 ; **Savoie / Haute-Savoie** :
  décision juridique.
- **Clé d'API** collée le 22/10 dans la conversation : à révoquer.
- **Preuves humaines** — #173, #528 ; non vérifié sur un vrai téléphone :
  #568, #561, #551.

## 4. Ce que la journée du 22/10 a appris

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
