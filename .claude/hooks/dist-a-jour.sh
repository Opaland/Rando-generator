#!/usr/bin/env bash
# Refuse de lancer Playwright sur un `dist/` périmé.
#
# ## Le raté, daté
#
# Playwright sert `dist/`, pas les sources. CLAUDE.md §6 le dit depuis des
# semaines, et la parade était « vérifier `✓ built` dans la sortie du build ».
#
# Dans la nuit du 23 au 24/08, le piège s'est refermé **trois fois** :
#
# 1. une injection de défaut a fait échouer `tsc -b` ; le build s'est arrêté,
#    `dist/` est resté à la version d'avant, et le test est passé au vert en
#    prouvant exactement le contraire de ce qu'on lui demandait ;
# 2. une réécriture de test a laissé un import inutilisé ; le build a échoué
#    pendant quatre commandes de suite. J'ai vu l'erreur, je l'ai lue, et j'ai
#    continué — parce que rien ne m'arrêtait ;
# 3. une correction de point de rupture a paru sans effet pendant vingt
#    minutes, pour la même raison.
#
# La leçon n'est pas « mieux vérifier ». C'est que **la vérification était à
# la charge de celui qui a déjà tort**. Un contrôle qu'il faut penser à lire
# ne garde rien ; celui-ci refuse.
#
# ## Ce qu'il ne fait pas
#
# Il ne construit pas à votre place. Construire en silence rendrait le temps
# d'exécution imprévisible et masquerait un build cassé derrière un test
# lent — le même défaut, déplacé.
set -uo pipefail

entree=$(cat 2>/dev/null || echo '{}')
commande=$(printf '%s' "$entree" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

case "$commande" in
  *"playwright test"*) ;;
  *) exit 0 ;;
esac

racine=$(git rev-parse --show-toplevel 2>/dev/null || echo .)
cd "$racine" || exit 0
[ -f package.json ] || exit 0

refuser() {
  jq -nc --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

if [ ! -d dist ]; then
  refuser "Playwright sert dist/, qui n'existe pas. Lancer \`npm run build\` d'abord — et lire sa sortie."
fi

# Le fichier le plus récent de chaque côté. `find -newer` compare deux
# fichiers, pas deux arbres : on prend donc le plus récent de dist comme
# témoin, et l'on cherche s'il existe une source plus récente que lui.
temoin=$(find dist -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -z "$temoin" ]; then
  refuser "dist/ est vide. Lancer \`npm run build\`."
fi

plus_neufs=$(find src public index.html vite.config.ts tsconfig*.json package.json \
  -type f -newer "$temoin" 2>/dev/null | head -5)

if [ -n "$plus_neufs" ]; then
  liste=$(printf '%s' "$plus_neufs" | tr '\n' ' ')
  refuser "dist/ est plus vieux que les sources : Playwright testerait une version périmée, et passerait au vert en prouvant le contraire de ce qu'on lui demande (CLAUDE.md §6). Modifiés depuis le dernier build : ${liste}. Lancer \`npm run build\` et vérifier qu'il affiche « ✓ built »."
fi

exit 0
