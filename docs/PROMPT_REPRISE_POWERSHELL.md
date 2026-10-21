# Reprendre Sentiers sur un PC Windows (PowerShell)

Deux parties :
- la mise en route de la machine, à faire une seule fois ;
- le prompt à coller dans Claude Code à chaque reprise.

La dernière session (locale, Windows, journée autonome du 21/10) s'est
arrêtée au commit qui met ce fichier à jour, sur la branche
`claude/sentiers-hiking-tracker-h28emt`. Bilan : arbre du 20/10 commité,
trois sprints livrés (#573, #574, #575), chacun avec revue adverse et
démonstration sur le réseau réel.

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
npm config set script-shell "C:\Program Files\Git\bin\bash.exe"
gh auth login
git clone -c core.autocrlf=false -c core.eol=lf https://github.com/Opaland/Rando-generator.git
cd Rando-generator
git checkout claude/sentiers-hiking-tracker-h28emt
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
- **`core.autocrlf=false` et `core.eol=lf`** : Git pour Windows convertit
  par défaut les sources en CRLF. Les scripts de gardes cherchent des `\n`,
  et `npm run listes` sortait rouge sur un arbre propre (19/10). Sur un
  clone déjà fait en CRLF : `git config core.autocrlf false`,
  `git config core.eol lf`, puis `git rm -rq --cached .` et
  `git reset -q --hard HEAD`, sur un arbre propre uniquement.
- **`script-shell`** : `npm run monkey`, `mesure` et quelques autres sont
  écrits `MONKEY=1 playwright test …`, une syntaxe bash que `cmd.exe` ne
  comprend pas. Sans ce réglage, lancer le monkey depuis Git Bash :
  `MONKEY=1 npx playwright test tests/e2e/monkey.spec.ts --workers=2`.

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
excuser. #572 reste ouverte pour le recalage des 14 tests qu'attend Cédric.

---

## 2. Le prompt de reprise

À coller tel quel dans Claude Code, lancé depuis le dossier du dépôt :

```text
Reprise de Sentiers sur mon PC (Windows, PowerShell, Claude Code natif
avec Git Bash). Branche claude/sentiers-hiking-tracker-h28emt — ne
pousse que là, n'ouvre aucune PR et ne merge rien sur main sans que je le
demande.

Avant tout :
1. git fetch et git status : arbre propre et à jour, sinon arrête-toi et
   dis-le-moi. Vérifie la CI du dernier commit de la branche et l'état
   de main (CI et GitHub Pages) — CLAUDE.md §7.
2. Relis CLAUDE.md en entier (il fait foi), puis ce fichier
   (docs/PROMPT_REPRISE_POWERSHELL.md, §1, §3 et §4), et
   docs/OPTIMISATION_TOKENS.md.
3. Vérifie que les hooks tournent : jq --version, gh auth status,
   bash --version, et git config core.autocrlf qui doit valoir false.

Puis, dans cet ordre :

A. Une seule question groupée (AskUserQuestion) pour les décisions du §3
   de ce fichier, recommandation en premier. Ne commence aucun sprint
   avant mes réponses ; ce que je laisse « plus tard » reste ouvert.

B. Une revue courte du projet : ce qui a changé depuis le 21/10, les
   issues ouvertes, et ce que la skill revue-globale demande de mesurer.
   Pas une revue globale complète : la dernière date du 19/10, et les
   trois sprints du 21/10 ont chacun eu leur revue.

C. Des EPIC + US sur GitHub (une épopée par sprint, label epic), puis des
   sprints d'une épopée au plus. Candidats, à confirmer par mes réponses :
   - #578 (le cadrage de zone emporté par les GR de grande traversée), si
     je tranche la piste ;
   - #577 (le ⓘ du crédit sur la marge de la fiche) ;
   - les deux points « sans mesure » de #570 ;
   - #290 volet 2 (peindre le tracé selon son balisage), si je tranche ;
   - #296 (chercher l'historique par lieu).

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

Communication : des points d'étape COURTS — fait / en cours / attend ma
décision — à chaque fin d'étape, pas un fil continu. Je me suis perdu le
21/10 dans un flot de messages détaillés.

À la fin de la journée : revue, clôture, et mise à jour de ce fichier
avec le prompt du lendemain.
```

---

## 3. Ce qui attend la décision de Cédric

Tranché le 21/10, et déjà codé : l'Ain reste en fond et ne compte jamais
(#574) ; les boutons de la fiche ne sortent plus sur le papier (#552) ;
« Affichage » en tête de Réglages, déplié (#576).

Reste ouvert :

- **#578** — choisir une zone cadre la moitié de la France : l'emprise des
  GR de grande traversée emporte celle de la zone. Trois pistes sur
  l'issue (emprise de la zone administrative, portions dans la zone, ou un
  quantile des points). Vu deux fois en démonstration.
- **#577** — au téléphone, le ⓘ du crédit (au-dessus de tout depuis le
  20/10) se pose sur la marge droite de la fiche.
- **#572** — le correctif de caméra avec le recalage des 14 tests, ou le
  laisser.
- **#570, deux points sans mesure** — la feuille pleine en revenant sur
  « Carte » en gros texte ; l'intertitre orphelin à 1 024.
- **#290 volet 2** — peindre le tracé de la couleur de son balisage :
  69 % des relations mesurées portent un `osmc:symbol`, dont 12 sur 18
  bicolores. Que faire d'un balisage bicolore ?
- **#560, sous-point 3** — la distance de l'historique compte le trajet
  fait pendant une pause.
- **Rhône (#20, #87)** — l'API GeoJSON datARA répond toujours 403 le
  21/10. **Savoie / Haute-Savoie** : la décision juridique (licence non
  nommée) reste à prendre.
- **Outillage Windows** — `.gitattributes` et `cross-env`, pas faits sans
  accord.
- **`libelleCompletion`, `COMPLETION_PCT`** — à trancher ou à retirer
  (`REVUE_GLOBALE_19_10.md`).
- **La tâche planifiée « Sentiers — backlog autonome »** continue de se
  déclencher dans le cloud : à désactiver si le travail reste local.
- **Preuves humaines** — #173 (Théo et Jeanine, seuls), #528 (un vrai
  lecteur d'écran). **Non vérifié sur un vrai téléphone** : Retour qui
  ferme la fiche (#568), l'IP du réseau local (#561), le double-tap (#551).

## 4. Ce que la journée du 21/10 a appris

- **La carte réelle trouve ce que les bouchons cachent.** En une journée :
  le crédit sur le bas de la fiche, les boucles de l'Ain invisibles de
  près, le gros texte introuvable, des boutons sur le papier, le cadrage de
  zone (#578). Aucun n'était visible dans un test vert. Skill
  `carte-reelle`.
- **Une mesure jetable se configure comme la vraie** (§1bis) : trois de
  mes sondes ont menti le même jour — une requête Overpass qui ne
  rapportait pas les chemins, des boîtes pdf.js qui ne disent pas ce qui
  est peint, un parcours de tabulation qui s'arrêtait au premier `<svg>`.
  Chaque fois, c'est un témoin ou une image qui a tranché.
- **Sous Windows**, ne pas découper un commit hunk par hunk via Python
  (CR et lignes décalées), et vérifier qu'un remplacement scripté a bien
  écrit avant de lancer ce qu'il modifie : `npm run pdipr` a réécrit le
  jeu de l'Isère au lieu de préparer l'Ain (restauré).
