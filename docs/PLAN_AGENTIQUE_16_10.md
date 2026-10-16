# Plan agentique à quatre phases (16/10/2026)

Demande de Cédric : terminer le développement en autonomie, puis — une fois
le backlog codable épuisé — un audit applicatif, un dernier sprint correctif
à partir de cet audit, et une veille concurrentielle (rando/ski/vélo) pour en
retenir des idées documentées.

Ce document fixe l'ordre et les frontières de chaque phase, pour que la
Routine `Sentiers — backlog autonome` (`trig_01EgqAdxiQxP4Q7Pm4LKveV5`) les
suive de façon identique à chaque déclenchement, même après une coupure.

---

## Phase A — Sprints (en cours)

Un item codable par déclenchement, choisi parmi les issues ouvertes qui ne
dépendent d'aucune séance utilisateur, mesure terrain, ni décision
produit/business/juridique. Discipline inchangée : TDD, porte complète
avant tout commit touchant `src/`, un item par PR, jamais e2e et monkey en
parallèle (leçon du 13-14/10).

**Fin de phase** : un déclenchement qui ne trouve plus aucun item codable —
tout ce qui reste exige un humain (liste revérifiée à chaque fois, pas
supposée figée : #173, #171, #528, #504, #152, #150, #290, #327, #462, #2,
#162, #15 au 15/10). Le dire une fois, puis enchaîner sur la phase B dans
le même tour plutôt que de simplement s'arrêter.

## Phase B — Audit applicatif (une fois)

**Pas de serveur Playwright MCP connecté à cette session** — vérifié par
recherche d'outil le 16/10, aucun `mcp__playwright__*` disponible. La
demande visait Playwright piloté en direct sur l'application ; c'est déjà
ce que fait le Playwright du dépôt lui-même (`npx playwright test` contre
`dist/` réellement construit), donc l'équivalent fonctionnel existe sans
connecteur — skill `audit-ui`, agent `auditeur-ui`.

1. `npm run build`, vérifier `✓ built` (§6quater : jamais auditer un
   `dist/` périmé).
2. `tests/e2e/regles-d-ecran.spec.ts` aux quatre largeurs, dans tous ses
   états.
3. Captures d'écran et mesures manuelles (`document.elementFromPoint`,
   contrastes, ΔE) sur ce qu'aucune sonde automatique ne couvre
   aujourd'hui — en particulier ce qui a changé depuis le dernier audit
   global (28/08) : les sprints 1-9, le repli sur cache (#539), la marge
   de `trancheZone.ts`.
4. Ne garder que ce qui se mesure — jamais une opinion esthétique
   (CLAUDE.md §6sexies). Un seuil emprunté à une norme se nomme (WCAG
   2.5.5/2.5.8) ; un seuil jugé se dit comme tel.
5. Écrire les constats dans un nouveau fichier `docs/AUDIT_APPLICATIF_`
   suivi de la date du jour, même format que les audits précédents : la
   mesure, où, ce que ça coûte, ce qui l'a caché.
6. **Ne rien corriger dans cette phase.**

## Phase C — Sprint correctif (une fois, après B)

Reprendre les constats un par un. Pour chaque constat mesuré et codable :
TDD, porte complète, un commit par constat, poussé. Un constat qui demande
un jugement (couleur, texte, choix de présentation) se documente comme
question ouverte pour Cédric plutôt que d'être tranché seul (§2) — il ne se
corrige pas à l'aveugle.

**Fin de phase** : tous les constats codables traités ou documentés comme
nécessitant une décision.

## Phase D — Veille concurrentielle (une fois, après C)

Chercher sur le web et sur GitHub/GitLab des applications existantes ou
proches : randonnée, ski, vélo — suivi GPS, outdoor tracking. Pour chaque
application d'intérêt réel : ce qu'elle fait de mieux que Sentiers, et
pourquoi ça compterait ici.

Écrire les trouvailles dans un nouveau fichier `docs/VEILLE_CONCURRENTIELLE_`
suivi de la date du jour — des **propositions documentées, jamais du
code**. Reprendre une idée change le
produit ; c'est une décision de Cédric, pas quelque chose à trancher seul.
Vérifier chaque proposition contre `FEUILLE_DE_ROUTE.md` « Ce qu'on ne fera
pas » (pas de navigation, pas de compte/serveur, pas de classement) avant
de la retenir — et le dire explicitement si une idée séduisante s'y heurte
plutôt que de l'écarter en silence.

**Ne pas implémenter de nouvelle fonctionnalité dans cette phase.**

---

## Après la phase D

Le dire clairement, et s'arrêter. Ne pas relancer le cycle depuis la phase A
sans qu'un humain ne le redemande explicitement — les quatre phases
répondent à une demande ponctuelle, pas à une boucle permanente.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0154ZRyRPiim5MLBEbLCNbw3
