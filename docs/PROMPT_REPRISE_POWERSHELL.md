# Reprendre Sentiers sur un PC Windows (PowerShell)

Deux parties :
- la mise en route de la machine, à faire une seule fois ;
- le prompt à coller dans Claude Code à chaque reprise.

La dernière session (locale, Windows, nuit du 19 au 20/10) s'est arrêtée au
commit qui met ce fichier à jour, sur la branche
`claude/sentiers-hiking-tracker-h28emt`.

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
2. `/porte` doit sortir verte, monkey compris, **à trois ou quatre tests
   près** : ceux de #572, ci-dessous.
3. Pour tester sur le téléphone, lancer
   `npm run build; npm run preview -- --host`, puis ouvrir l'adresse affichée
   depuis le téléphone, sur le même Wi-Fi. Depuis #561, la page ne reste
   plus blanche sur cette origine non sécurisée. Elle n'a simplement pas
   de service worker, donc pas de hors-ligne.

### Ce qui rougit sous Windows sans être du code neuf : #572

`terrain-sur-carte.spec.ts` (3 tests) et `visibilite-zoom.spec.ts:111`
sont rouges, **aussi sur l'arbre propre**. `profil-lisible.spec.ts:242`
tombe parfois sous charge. Cause mesurée : la remise à plat de la vue 3D
(`useMapCamera.ts`) interrompt le `fitBounds` de la fiche. Le correctif
d'une ligne marche, mais il fait tomber 14 autres tests, calés sur la
caméra interrompue. Tout est sur l'issue, et la décision attend Cédric.

---

## 2. Le prompt de reprise

À coller tel quel dans Claude Code, lancé depuis le dossier du dépôt :

```text
Reprise de Sentiers sur mon PC (Windows, PowerShell, Claude Code natif
avec Git Bash). Branche claude/sentiers-hiking-tracker-h28emt — ne
pousse que là, n'ouvre aucune PR et ne merge rien sur main sans que je le
demande.

Avant tout :
1. git fetch origin claude/sentiers-hiking-tracker-h28emt et git status :
   arbre propre et à jour, sinon arrête-toi et dis-le-moi.
2. Relis CLAUDE.md en entier (il fait foi), puis
   docs/PROMPT_REPRISE_POWERSHELL.md (§1, « Ce qui rougit sous Windows »
   et §3), docs/REVUE_GLOBALE_19_10.md (section « Seconde passe ») et
   docs/OPTIMISATION_TOKENS.md.
3. Vérifie que les hooks tournent vraiment : `jq --version`,
   `gh auth status` et `bash --version` doivent répondre, et
   `git config core.autocrlf` doit valoir false ; si la porte avant
   commit ne bloque pas un commit volontairement cassé, arrête-toi et
   dis-le-moi avant d'écrire une ligne.
4. Vérifie l'état du déploiement de main (CI et GitHub Pages) avant
   d'empiler quoi que ce soit (CLAUDE.md §7).

Déjà fait le 19-20/10 et fermé : #561, #554, #548, #551 (plus a575559,
ports sous Windows). Ouverte en route : #572 (caméra, 3 à 4 e2e rouges
sous Windows, sur l'arbre propre aussi) : ne la corrige pas sans mon
accord, elle demande de recaler 14 tests. En attendant, une porte est
« verte » si seuls les tests listés sur #572 rougissent ; tout autre
rouge est à toi.

Suite, dans cet ordre, une issue par commit (ou par sous-point si
l'issue en contient plusieurs indépendants) :

  #560  enregistrement, sous-points 1, 2 et 4 seulement :
        1. trace perdue si l'écriture échoue : ne vider le tampon
           qu'après une écriture réussie, et le dire ; vérifie par un
           test qu'au redémarrage la sortie est bien reproposée, avant
           d'écrire un message qui le promet ;
        2. sortieErreur non remise à zéro par poursuivreSortie ;
        4. « dans la poche » : aucune surface ne dit de garder l'écran
           allumé (grep sur la formule, §3).
        Le sous-point 3 (distance comptant la pause) change un calcul :
        propose-moi le choix, n'y touche pas.
  #549  id perso réutilisé : déclaration et objectif fantômes
  #550  zone restaurée au démarrage sans ses gardes
  #562  glisser-déposer limité au .gpx
  #563  service worker et cache.put en quota
  #553  la fiche recouvre le crédit de la carte et les boutons de zoom
  #555  ⓘ du crédit sous « Démarrer une sortie » à 390 px
  #556  gros texte à 390 px
  #552  impression
  #557  attribution (licences) — tracé dessiné, GPX réimporté, crédit imprimé
  #558  confidentialité — phrase fausse à l'import, compteur aveugle aux GET
  #559  sauvegarde et restauration
  puis #567, #568, #569, #570, #571 (mineurs), et en dernier
  #564, #565, #566 (ceux-là changent un calcul ou une présentation :
  propose-moi d'abord le choix, §2, n'invente pas le seuil).

Méthode, sans exception (CLAUDE.md) :
- TDD sur src/core ; pour chaque correctif, le test d'abord, vu ROUGE
  sur le code actuel, puis vert ; et après coup, retire le correctif et
  regarde le test rougir de nouveau (§1).
- Pour l'interface, mesure ce qui est PEINT (elementFromPoint / estAlEcran
  de tests/e2e/helpers.ts), dans un expect.poll, à la bonne largeur, au
  doigt (hasTouch) quand c'est sous 801 px (§1bis). Pour l'impression,
  un vrai page.pdf, pas seulement emulateMedia.
- Quand un défaut a échappé à la sonde des règles d'écran, élargis la
  sonde dans le même commit et prouve qu'elle rougit défaut remis
  (§6quinquies).
- Porte complète avant chaque commit qui touche autre chose que des docs :
  lint, listes, textes, chemins, typecheck (npx tsc -b --noEmit),
  coverage, ports, build, e2e, monkey. npm run build avant tout e2e, et
  dans une commande à part (le hook juge la commande avant qu'elle
  s'exécute). Ne touche à rien pendant qu'une porte tourne (§6quater) :
  ni source, ni test, ni stash. Les plafonds de taille (store,
  composants) tombent dans coverage, pas dans le hook : prévois-les.
- Un test rouge mis de côté pour committer autre chose se met de côté
  (git stash) AVANT de lancer la porte, jamais pendant.
- Pas de prettier sur un fichier entier : le dépôt n'est pas formaté
  par lui.
- Une correction de texte se fait sur toutes les surfaces : grep sur la
  formule, pas sur le fichier (§3).
- Commits en français, un item par commit, poussés aussitôt la porte
  verte. Ferme chaque issue par un commentaire qui cite le commit, et
  ne ferme pas ce qui demande une preuve humaine (§10).
- Ne prétends rien que tu n'as pas vérifié (§5) : si un test n'a pas pu
  tourner sous Windows, dis-le.

Toutes les quatre issues traitées, fais-moi un point court : ce qui est
poussé, ce qui a résisté, ce qui attend ma décision.
```

---

## 3. Ce qui attend la décision de Cédric

- **#572** : faire le correctif de caméra avec le recalage des 14 tests,
  ou le laisser de côté.
- **#554, reste** : à 390×667 (iPhone SE), une taille que la sonde ne
  mesure pas, « Ma position » remonte sur les boutons de zoom pendant le
  tracé, faute de place. Masquer le bouton sur les écrans courts, ou
  réduire `--hauteur-trace`.
- **#560, sous-point 3** : la distance de l'historique compte le trajet
  fait pendant une pause (7 km contre 2 km à l'écran de fin).
- **Outillage Windows** : un `.gitattributes` (`* text=auto eol=lf`) et
  `cross-env` pour les scripts `MONKEY=1 …` rendraient le §1 inutile sur
  un nouveau clone. Changement du dépôt, pas fait sans accord.
- **#547** : la tolérance du départage de #151 attend ta décision. La
  mesure sur 12 de tes sorties est publiée sur l'issue. Les traces Strava
  et le script de mesure sont restés dans le scratchpad cloud, et ne sont
  **pas** dans le dépôt : ce sont tes données personnelles.
- **`libelleCompletion`** (aucun écran ne l'affiche) et **`COMPLETION_PCT`**
  (plus aucun appelant) : à trancher ou à retirer (`REVUE_GLOBALE_19_10.md`,
  §3 et §4).
- **`qs`** : laissé en l'état sur ta décision du 19/10.
- **La tâche planifiée « Sentiers — backlog autonome (1 jour sur 2) »**
  continue de se déclencher dans le cloud. En travail local, la désactiver
  évite que deux sessions poussent sur la même branche.
- **Non vérifié sur un vrai téléphone** : #561 (IP du réseau local) et le
  double-tap de #551.
