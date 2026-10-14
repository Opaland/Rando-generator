# Mesure #539 — séparer analyse et correspondance (14/10/2026)

Suite de `docs/MESURE_BIBLIOTHEQUE_08_10.md` et de l'issue #539, qui
laissait ouvert lequel de l'analyse séquentielle des fichiers ou de
l'unique calcul de correspondance final dominait le temps d'import d'une
grosse bibliothèque.

## Ce qui a été instrumenté

`tests/e2e/mesure-bibliotheque.spec.ts` chronométrait jusqu'ici un seul
chiffre (`import_ms`). Une première tentative guettait `matchingBusy`
(l'indicateur « calcul… » du tableau de bord) dans le DOM pour repérer la
frontière entre les deux phases : à 5 puis 50 activités, l'indicateur n'est
jamais apparu, alors que la suite de cette mesure montre que le calcul a
bien pris un temps très mesurable. Rien ne garantit qu'un rendu React
s'intercale entre les deux `set()` Zustand qui encadrent l'appel — ni pour
le relais au worker, ni pour un éventuel repli synchrone — et une sonde qui
dépend d'un rendu qui n'a pas à avoir lieu ne garde rien (CLAUDE.md §1bis).

Le repère retenu : `performance.mark('sentiers:recompute:debut' |
'sentiers:recompute:fin')`, posé dans `recompute()` (`appStore.ts`) de part
et d'autre de l'appel à `computeMatching`. Il ne dépend d'aucun rendu —
seulement du fil qui appelle `recompute`, jamais de celui qui peint.

## Ce qui est mesuré

Aucun itinéraire n'est chargé dans cette mesure (`mesure-bibliotheque.spec.ts`
n'ouvre aucune zone) : la correspondance se résume donc à construire l'index
spatial sur la totalité des points des traces importées
(`buildTrackIndex`), indépendamment du nombre d'itinéraires — c'est
justement la partie qu'#539 visait.

| activités | points totaux | analyse_ms | correspondance_ms | ratio corresp./analyse |
|---:|---:|---:|---:|---:|
| 50  | 450 000   | 5 028   | 64 073    | 12,7× |
| 200 | 1 800 000 | 19 634  | 1 421 382 | 72,4× |

Entre 50 et 200 activités, les points totaux sont multipliés par **4** :
- `analyse_ms` est multiplié par **3,9×** — linéaire, comme attendu d'une
  boucle qui traite chaque fichier à la suite.
- `correspondance_ms` est multiplié par **22,2×** — très au-delà de
  linéaire, et au-delà même de quadratique (16× attendu pour ×4 points).

## Ce que ça départage

**La correspondance domine très largement, et son coût croît plus vite que
le carré du nombre de points.** À 200 activités, `correspondance_ms`
(1 421 382 ms ≈ 23,7 min) représente 98,6 % du temps total, contre 1,4 %
pour l'analyse. C'est l'inverse de ce qu'un recalcul répété par fichier
(écarté par lecture de code dans la mesure du 08/10) aurait laissé
craindre, et ça explique directement pourquoi la mesure à 800 activités du
08/10 n'avait pas fini dans son plafond de 25 minutes : à ce rythme de
croissance, 800 activités (4× de plus que 200) rendraient une
correspondance de l'ordre de plusieurs dizaines de minutes à largement
plus d'une heure, bien au-delà de n'importe quel plafond raisonnable
d'attente pour une personne.

**Ce que ça écarte, explicitement.** #539 mettait en garde contre la
réintroduction d'un Web Worker pour le *parsing* sur la seule foi de
l'ancien chiffre global — cette mesure confirme que ce serait un
correctif au mauvais endroit : l'analyse est déjà rapide et linéaire,
le goulot est dans la construction de l'index spatial des points de
correspondance.

## Ce qui reste ouvert

Cette mesure dit **où**, pas **pourquoi** à l'intérieur de
`buildTrackIndex`/`matchSamples` (`core/matching.ts`) le coût explose —
une structure quadratique assumée dans l'implémentation, une ré-allocation
répétée, autre chose. Le déterminer demande de lire ou profiler ce code,
pas de mesurer l'e2e davantage ; ce n'est pas tranché ici, par discipline
du §2 : une mesure dit ce qu'il faudrait pour trancher, elle ne devine pas
le correctif.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0154ZRyRPiim5MLBEbLCNbw3
