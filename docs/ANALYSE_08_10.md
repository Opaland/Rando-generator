# Analyse complète — technique et fonctionnelle (08/10/2026)

Deux audits menés en parallèle sur l'état réel du dépôt après la fusion de
la PR #540 (sprints 1-6). Chaque trouvaille listée ci-dessous a été vérifiée
à la main — sur le code, sur `git log`, ou directement sur GitHub — avant
d'être retenue ; ce qui a été soupçonné puis infirmé n'apparaît pas.

---

## 1. Analyse technique

### 1.1 Dette technique chiffrée (plafonds testés)

| fichier | lignes/plafond | marge |
|---|---:|---:|
| `src/store/trancheZone.ts` | 495/495 | **0** |
| `src/store/matchingClient.ts` | 109/110 | 1 |
| `src/components/ItineraryList.tsx` | 966/970 | 4 |
| `src/components/LocateButton.tsx` | 61/65 | 4 |
| `src/store/epilogueDImport.ts` | 71/80 | 9 |
| `src/components/UpdateBanner.tsx` | 71/80 | 9 |
| `src/components/BalisePeinte.tsx` | 71/80 | 9 |
| `src/store/sourcesLocales.ts` | 100/110 | 10 |

`trancheZone.ts` — la tranche que #155 a elle-même extraite d'`appStore.ts`
— est aujourd'hui à son propre plafond, zéro marge : la prochaine ligne le
casse. `appStore.ts` (1083/1105, marge 22) et `ItineraryDetail.tsx`
(946/965, marge 19) restent sous contrôle.

### 1.2 Couverture (`npm run coverage`) — 96,3 % stmt / 91,85 % branches

Points faibles réels :

- `src/lib/ecran.ts` : 9,09 % stmt, **0 % branche** — `useEcranCompact`
  (le seuil 800px compact/large, consommé par la navigation par onglets)
  quasiment pas testé en unitaire.
- `src/lib/download.ts` : 42,1 % stmt, 0 % branche.
- `src/store/appStore.ts` : 82,55 % branches — le plus gros fichier du
  dépôt est aussi le moins couvert du store.
- `src/core/fit.ts` : 75 % branches — pire branche de `core`.

`matching.ts` et `discovery.ts`, les plus critiques, sont corrects (>91 %
branches) malgré leur taille.

### 1.3 Exports morts

Aucun export **valeur** (const/function/class) inutilisé. Mais ~75 exports
de **type/interface** ne sont référencés par leur nom nulle part hors de
leur fichier d'origine (vérifié à la main sur 9 échantillons, pas par grep
seul) — surface d'API exportée sans consommateur réel.

### 1.4 Garde manquante : `og-image.mjs`

`scripts/og-image.mjs` lance Chromium (`PW_CHROMIUM_PATH`) exactement comme
`e2e`/`monkey`/`mesure`/`chargement`/`panneau`/`reel` — mais la garde
`scripts/jumelles/11-playwright.mjs` ne détecte que les scripts dont la
commande matche littéralement `playwright test`, et ni le README ni
CLAUDE.md §6 ne le nomment dans le paragraphe `PW_CHROMIUM_PATH`. C'est
l'angle mort de l'issue #435, reproduit sur un septième script.

### 1.5 Sécurité

`npm audit --omit=dev` : 0 vulnérabilité. (`npm audit` complet : 6, toutes
dans `undici`, transitif dev-only, jamais expédié.) Seul point d'injection
HTML réel (`poiPopup.ts` → `useMapInteractions.ts`) vérifié : les deux
branches échappent correctement via `escapeHtml`. Aucun
`eval`/`new Function`/`dangerouslySetInnerHTML` dans `src/`.

### 1.6 Poids du build et dépendances

`MapView.js` (carte) : 956 kB / 249 kB gzip, déjà isolé en code-splitting —
le reste de l'app tient à 132 kB gzip. 18 paquets npm en retard (React 19,
TypeScript 7, Vitest 5 — migrations majeures, aucune CVE associée).

---

## 2. Analyse fonctionnelle

### 2.1 Trouvaille principale : #173 contredit sa propre citation

**#173** (Théo 9 ans / Jeanine 76 ans) est citée comme l'exemple canonique
du §10 de CLAUDE.md — « une issue reste ouverte tant que la preuve humaine
manque, même si le code est fini ». `FEUILLE_DE_ROUTE.md`, `PRD.md` et
`PERSONAS.md` l'affirment encore.

**Vérifié sur GitHub : #173 a été ouverte le 21/08 à 10h23 et fermée le
même jour à 15h56**, par le merge de la PR #196, sans aucun commentaire,
sans trace d'une séance avec Théo ou Jeanine — alors que son propre texte
dit explicitement : « La preuve n'est pas un test automatisé : c'est Théo
et Jeanine menant chacun une tâche complète devant l'équipe, sans aide.
Tant que cette séance n'a pas eu lieu, le lot n'est pas fini. »

Trois documents écrits **après** cette fermeture continuent d'affirmer
qu'elle est ouverte. C'est le mécanisme du §3 (une correction qui n'atteint
pas toutes les surfaces), appliqué à la discipline elle-même.

### 2.2 Issues résolues dans le code, pas fermées sur GitHub

- **#477** — implémenté (`0298289`). Encore « open ».
- **#523** — implémenté (`74a3df7`). Encore « open ».
- **#361** — tranché par Cédric le 07/10 (`aa0d664`, « non, le suivi
  système suffit »). Encore « open ».
- **#149, #155** — fermées (vérifié directement). **#157** (l'épopée qui
  les indexe) affirme toujours qu'elles font partie des « quatre enfants
  ouverts » — vérifié : sa table n'a pas été mise à jour depuis le 07/09.

### 2.3 Pattern confirmé : bloqué sur décision/mesure humaine

Au-delà de #333/#462/#504 déjà connus, le même schéma — mesure faite,
décision volontairement non prise, §2 invoqué — est systématique :
#150 (corpus GPS), #152 (mesure batterie terrain), #171 (hypothèse de
disposition jamais validée en session), #290 (58,4 % de contradiction
carte/balisage mesurée, décision à Cédric), #296 (piste 3 bloquée sur un
poids de bundle), #327 (IA locale, une seule mesure manque), #528 (le
correctif technique est posé, mais la vraie vérification — un lecteur
d'écran réel — ne l'a pas été).

Sept à huit issues partagent ce seul goulot d'étranglement : une séance
utilisateur groupée (Théo/Jeanine/Zoé pour #171/#504/#528/#290 ; deux
téléphones pour #152+#327) les débloquerait d'un coup. C'est plus limitant
aujourd'hui que le code manquant.

### 2.4 Persona sans issue de suivi

**Léa** (PDIPR importé) : `src/store/trancheImport.ts:381` porte
`network: 'PERSO'` — vérifié dans le code — le même réseau qu'un tracé
dessiné à la main, sans badge distinct pour une source institutionnelle.
`PERSONAS.md` le documente comme non résolu, mais **aucune des 26 issues
ouvertes** ne porte ce sujet (ni #87, qui porte sur l'intégration de
nouvelles sources, pas sur celles déjà importées).

### 2.5 Ce qui a été vérifié et tient

Les affirmations du README (hors-ligne, confidentialité, export/attribution,
impression, sauvegarde, accessibilité) correspondent au code. Les six
défauts de cohérence texte/code trouvés par la revue globale du 28/08 sont
tous corrigés et fermés. Aucune nouvelle divergence trouvée au-delà du cas
Léa.

---

## 3. Sprints proposés

### Sprint 7 — Nettoyage de gouvernance (coût faible, en premier)

Avant tout nouveau code : la méthode citée dans CLAUDE.md doit être vraie.

1. **#173** : rouvrir et planifier la vraie séance Théo/Jeanine, ou documenter explicitement (dans l'issue, avec date et signature) pourquoi la preuve a été jugée inutile — à trancher par Cédric, pas par moi.
2. Fermer sur GitHub #477, #523, #361 (déjà résolus dans le code, zéro ligne de code pour ce sprint).
3. Mettre à jour la table de #157 (#149/#155 → clos) ou la fermer si les deux restants (#150, #152) ont leur propre suivi.
4. Ouvrir une issue pour le badge réseau institutionnel de Léa (§2.4), avant qu'elle ne s'oublie faute de ticket.
5. Documenter `og-image` dans le paragraphe `PW_CHROMIUM_PATH` du README/CLAUDE.md §6, et élargir `11-playwright.mjs` au motif `chromium.launch` plutôt qu'au littéral `playwright test`.

### Sprint 8 — Dette technique ciblée

1. **`trancheZone.ts`** (0 ligne de marge) : sortir un sous-bloc (ex. la recherche de lieu, déjà distincte par son propre compteur) ou relever le plafond en le justifiant — ne pas laisser un prochain commit casser la garde en silence.
2. **`matchingClient.ts`** (1 ligne de marge) : même diagnostic, scope plus petit.
3. Couverture : tests unitaires ciblés sur `src/lib/ecran.ts` (le seuil compact/large, 0 % branche) et `src/lib/download.ts`.
4. Nettoyer les ~75 exports de type inutilisés hors de leur fichier (petit, mécanique, par lot).
5. `npm audit fix` pour `undici` (dev-only, sans risque).

### Sprint 9 — Import volumineux (#539), mesure avant correctif

1. Instrumenter `tests/e2e/mesure-bibliotheque.spec.ts` pour chronométrer séparément la boucle d'analyse séquentielle et l'unique appel de correspondance final (actuellement confondus dans un seul chiffre).
2. Mesurer un point intermédiaire (ex. 400 activités) pour confirmer ou infirmer un comportement linéaire.
3. Décider seulement ensuite — ne pas réintroduire un Web Worker sur la seule foi du chiffre actuel, l'issue le met explicitement en garde.

### Non retenu pour un sprint (nécessite une personne, pas du code)

#171, #504, #528 (vérification réelle), #290, #152, #327 : à regrouper en
deux séances utilisateur (une UX avec Zoé/Théo/Jeanine, une terrain avec
deux téléphones) plutôt qu'en items de sprint — coder une décision que ces
issues réservent explicitement à une personne referait l'erreur que §2
interdit.
