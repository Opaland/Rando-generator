#!/usr/bin/env bash
# État du dernier déploiement de main, au démarrage de session.
#
# Le protocole de développement demande de vérifier le déploiement à chaque
# itération. Sur une session entière, je ne l'ai fait qu'à la fin : une
# consigne qu'on peut oublier finit par être oubliée. Ici, elle arrive sans
# qu'on la demande.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

message() { jq -nc --arg m "$1" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$m}}'; }

depot=$(git config --get remote.origin.url 2>/dev/null | sed -E 's#.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#')
[ -n "$depot" ] || exit 0

# gh n'est pas disponible partout (l'environnement distant ne l'a pas) :
# sans lui, on le dit au lieu de laisser croire que tout va bien.
if ! command -v gh >/dev/null 2>&1; then
  message "Déploiement de main : non vérifié au démarrage (gh absent). Le vérifier via les outils GitHub avant de committer — c'est l'étape que j'ai sautée pendant toute une session."
  exit 0
fi

etat=$(gh run list --repo "$depot" --branch main --limit 3 \
  --json name,conclusion,headSha,createdAt 2>/dev/null) || etat=""

if [ -z "$etat" ] || [ "$etat" = "[]" ]; then
  message "Déploiement de main : état indisponible. À vérifier à la main."
  exit 0
fi

rouge=$(printf '%s' "$etat" | jq -r '[.[] | select(.conclusion != null and .conclusion != "success")] | length')
resume=$(printf '%s' "$etat" | jq -r '.[] | "\(.name): \(.conclusion // "en cours")"' | paste -sd' · ' -)

if [ "$rouge" -gt 0 ]; then
  message "⚠ Déploiement de main EN ÉCHEC — $resume. Ne rien empiler dessus : corriger d'abord (voir CLAUDE.md, « ce qui vaut arrêt »)."
else
  message "Déploiement de main : $resume"
fi
