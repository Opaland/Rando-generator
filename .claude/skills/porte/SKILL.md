---
name: porte
description: Lance la porte complète avant commit sur Sentiers — lint, typecheck, couverture, build, e2e Playwright et monkey — dans le bon ordre et avec les bons pièges évités. À utiliser avant tout commit, et quand on veut savoir si l'arbre est sain.
---

# La porte complète

Le hook `PreToolUse` ne couvre que ce qui tient en une minute (lint,
typecheck, tests unitaires). Cette procédure lance le reste.

## L'ordre, et pourquoi

Lancer les étapes dans cet ordre — chacune coûte plus cher que la
précédente, autant échouer tôt.

```bash
npm run lint
npx tsc -b --noEmit        # PAS `tsc --noEmit` : voir plus bas
npm run coverage           # seuil 90 % de branches sur src/core
npm run build              # SANS masquer la sortie
export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
npx playwright test --workers=1
npm run monkey
```

## Trois pièges, tous mesurés sur ce dépôt

**`npx tsc --noEmit` rend 0 sans rien vérifier.** Le projet utilise les
références de projet TypeScript. Vérifié : un fichier délibérément cassé
passe `tsc --noEmit` et échoue `tsc -b --noEmit`.

**Ne jamais faire `npm run build >/dev/null`.** Un build qui échoue laisse
`dist/` dans son état précédent, et Playwright teste alors une version
périmée — six tests e2e ont ainsi échoué pour rien, le temps de comprendre.

**`--workers=1`.** En parallèle, les tests se marchent dessus.

## Quand un test e2e échoue

1. Le relancer **isolément**. S'il passe seul, ce n'est pas forcément un
   flake : c'est peut-être une course que la charge révèle.
2. `git stash` puis relancer la suite complète. Si l'arbre propre échoue
   aussi, le défaut préexiste ; sinon il est à moi.
3. **Ne pas conclure « instable » deux fois pour le même test.** La
   deuxième fois, chercher la cause — `detail.spec.ts:258` était un vrai
   défaut de rendu (#186), pas un test capricieux.

## Ce que la porte ne dit pas

Elle ne dit pas que le travail est fini. Elle dit qu'il ne casse rien.
