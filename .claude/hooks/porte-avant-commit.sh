#!/usr/bin/env bash
# Porte rapide avant tout commit (voir CLAUDE.md).
#
# Ne contient QUE ce qui tient en moins d'une minute : lint, listes
# jumelles, typecheck,
# tests unitaires. Le build, les e2e et le monkey restent dans /porte —
# les mettre ici rendrait chaque commit insupportable, et un garde-fou
# qu'on désactive ne garde rien.
#
# Motif : un commit de cette session est parti avec une erreur de lint,
# parce que le lint avait été lancé AVANT l'écriture du dernier fichier.
# Une vérification faite au bon moment vaut mieux qu'une vérification
# faite consciencieusement au mauvais.
set -uo pipefail

# Le filtre `if` de settings.json n'est pas honoré partout : on relit la
# commande nous-mêmes. Sans cela la porte se déclenchait sur CHAQUE commande
# bash — et une porte qui bloque pendant le rouge rend le TDD impossible,
# puisque rouge-puis-vert est justement la méthode. Un garde-fou qui gêne
# tout le temps finit désactivé, et ne garde alors plus rien.
entree=$(cat 2>/dev/null || echo '{}')
commande=$(printf '%s' "$entree" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
case "$commande" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

# Pas de package.json : ce dépôt n'est pas concerné, on ne bloque rien.
[ -f package.json ] || exit 0

echecs=""
sortie=""

lancer() {
  local nom="$1"; shift
  local log
  log=$("$@" 2>&1) || { echecs="${echecs}${nom} "; sortie="${sortie}
=== ${nom} ===
$(printf '%s' "$log" | tail -25)"; }
}

lancer "lint"      npm run lint --silent
# Les listes jumelles : le CSS et la sonde d'écran disent la même règle, et
# elles avaient le même trou le 25/08 (CLAUDE.md §4ter). Le script tient en
# une fraction de seconde, il a donc sa place ici plutôt que dans /porte.
lancer "listes"    npm run listes --silent
# Le README annonce-t-il tous les filtres du panneau ? Il en oubliait deux
# le 25/08, et aucune revue de diff ne pouvait l'attraper : le README
# n'était dans aucun diff (CLAUDE.md §3).
lancer "textes"    npm run textes --silent

# Un commentaire qui nomme un fichier affirme qu'il existe. Le fantôme
# `reseauxFiltrables.test.ts` a été annoncé plusieurs jours par un
# commentaire, sans avoir jamais été écrit (§4bis).
lancer "chemins"   npm run chemins --silent
# `tsc -b` et non `tsc --noEmit` : ce dépôt utilise les références de
# projet, et `tsc --noEmit` seul rend 0 sans rien vérifier. Mesuré : un
# fichier délibérément cassé passait la première commande et échouait la
# seconde. J'ai utilisé la mauvaise pendant toute une session sans le voir.
lancer "typecheck" npx tsc -b --noEmit
lancer "tests"     npx vitest run --silent

if [ -n "$echecs" ]; then
  raison="Porte avant commit : ${echecs}en échec. Corriger avant de committer.${sortie}"
  jq -nc --arg r "$raison" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
fi

jq -nc '{systemMessage:"Porte avant commit : lint, listes jumelles, textes, chemins cités, typecheck et tests unitaires au vert."}'
