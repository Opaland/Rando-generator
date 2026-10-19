# Reprendre Sentiers sur le PC fixe (PowerShell)

Deux parties :
- la mise en route de la machine, à faire une seule fois ;
- le prompt à coller dans Claude Code à chaque reprise.

La session cloud du 19/10 s'est arrêtée au commit qui ajoute ce fichier,
sur la branche `claude/sentiers-hiking-tracker-h28emt`.

---

## 1. Mise en route (une fois)

Dans PowerShell, sans droits administrateur sauf si `winget` le demande :

```powershell
winget install Git.Git
winget install jqlang.jq
winget install OpenJS.NodeJS.LTS
irm https://claude.ai/install.ps1 | iex
```

Ouvrir **un nouveau terminal** pour que le `PATH` soit relu, puis :

```powershell
npm config set script-shell "C:\Program Files\Git\bin\bash.exe"
git clone https://github.com/Opaland/Rando-generator.git
cd Rando-generator
git checkout claude/sentiers-hiking-tracker-h28emt
npm ci
npx playwright install chromium
claude
```

Pourquoi ces trois réglages, qui ne sont pas optionnels :

- **Git for Windows** : Claude Code s'en sert comme shell (Git Bash), et les
  hooks de `.claude/hooks/*.sh` en ont besoin. Sans lui, ils partiraient
  dans PowerShell et ne tourneraient pas.
- **`jq`** : les hooks lisent la commande avec. Sans `jq`, la porte avant
  commit **laisse tout passer en silence**, et le garde-fou est désactivé
  sans que rien ne le dise (CLAUDE.md §6quater).
- **`script-shell`** : `npm run monkey`, `mesure` et quelques autres sont
  écrits `MONKEY=1 playwright test …`, une syntaxe bash que `cmd.exe` ne
  comprend pas.

`PW_CHROMIUM_PATH` n'est **pas** à définir en local. `playwright.config.ts`
ne s'en sert que si elle existe, et `npx playwright install chromium`
installe le navigateur au bon endroit.

### Vérifier avant de travailler

1. Dans Claude Code, demander `/porte`. Elle doit sortir verte, monkey
   compris, ce qui prouve que `script-shell` a pris.
2. Faire un essai de commit avec une erreur de lint volontaire. **Il doit
   être refusé.** S'il passe, `jq` n'est pas vu par le hook ; dans ce cas,
   lancer `claude --debug` et lire pourquoi le hook a échoué.
3. Pour tester sur le téléphone, lancer
   `npm run build; npm run preview -- --host`, puis ouvrir l'adresse affichée
   depuis le téléphone, sur le même Wi-Fi.
   - **Attention, #561 :** ouverte par l'IP du réseau local, l'application
     est une origine non sécurisée. Elle n'a alors pas de service worker,
     et la page reste **blanche** tant que #561 n'est pas corrigé. C'est le
     premier item à traiter pour pouvoir tester sur le téléphone.

---

## 2. Le prompt de reprise

À coller tel quel dans Claude Code, lancé depuis le dossier `Rando-generator` :

```text
Reprise de Sentiers sur mon PC fixe (Windows, PowerShell, Claude Code
natif avec Git Bash). Branche claude/sentiers-hiking-tracker-h28emt — ne
pousse que là, n'ouvre aucune PR et ne merge rien sur main sans que je le
demande.

Avant tout :
1. git fetch origin claude/sentiers-hiking-tracker-h28emt et git status :
   arbre propre et à jour, sinon arrête-toi et dis-le-moi.
2. Relis CLAUDE.md en entier (il fait foi), puis
   docs/REVUE_GLOBALE_19_10.md (section « Seconde passe ») et
   docs/OPTIMISATION_TOKENS.md.
3. Vérifie que les hooks tournent vraiment sous Windows : `jq --version`
   et `bash --version` doivent répondre ; si la porte avant commit ne
   bloque pas un commit volontairement cassé, arrête-toi et dis-le-moi
   avant d'écrire une ligne.
4. Vérifie l'état du déploiement de main (CI et GitHub Pages) avant
   d'empiler quoi que ce soit (CLAUDE.md §7).

Ce qui est en cours : la revue globale du 19/10 a ouvert 24 issues de
type bug, #548 à #571. Traite-les dans cet ordre, une issue par commit
(ou par sous-point si l'issue en contient plusieurs indépendants) :

  #561  page blanche sans service worker (bloque les tests sur téléphone)
  #554  régression de #546 : « Ma position » sur le « × » du tracé à 390 px
  #548  « Actualiser les tracés » efface la copie hors ligne avant le réseau
  #551  double-clic : suppression sans confirmation, déclaration annulée
  #560  enregistrement : trace perdue si l'écriture échoue, alerte GPS qui reste
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
  ne touche à rien pendant qu'une porte tourne (§6quater).
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

## 3. Ce que la session cloud laisse en suspens

- **#547** : la tolérance du départage de #151 attend ta décision. La
  mesure sur 12 de tes sorties est publiée sur l'issue. Les traces Strava
  et le script de mesure sont restés dans le scratchpad cloud, et ne sont
  **pas** dans le dépôt : ce sont tes données personnelles.
- **`libelleCompletion`** (aucun écran ne l'affiche) et **`COMPLETION_PCT`**
  (plus aucun appelant) : à trancher ou à retirer (`REVUE_GLOBALE_19_10.md`,
  §3 et §4).
- **`qs`** : laissé en l'état sur ta décision du 19/10.
- **La tâche planifiée « Sentiers — backlog autonome (1 jour sur 2) »**
  continue de se déclencher dans le cloud. Si tu travailles désormais en
  local, la désactiver évite que deux sessions poussent sur la même
  branche.
