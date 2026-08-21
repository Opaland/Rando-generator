# Travailler sur Sentiers

Ce fichier porte les règles qu'aucune machine ne peut vérifier à ma place.
Ce qui est mécanique est dans `.claude/hooks/` et s'exécute tout seul ; ce
qui relève du jugement est ici, et repose sur ma discipline.

Chaque règle vient d'un raté réel, daté. Ce ne sont pas des principes
généraux, ce sont des cicatrices.

---

## 1. Un test qui ne peut pas échouer ne prouve rien

**Avant de croire un test, retirer le correctif et le regarder échouer.**

Deux fois dans la même session :

- ma vérification de l'échappement Overpass (#164) m'a fait conclure « pas
  de défaut » — la regex de contrôle était fausse, et le rapport avait
  raison ;
- un test « hors ligne » passait avec **et sans** le correctif, parce que
  `context.setOffline` de Playwright ne s'applique pas aux requêtes du
  service worker.

Il n'y a pas de raccourci : on enlève la correction, on relance, on vérifie
que c'est rouge. Un test écrit après coup qui passe du premier coup est
suspect jusqu'à preuve du contraire.

## 2. Ne pas inventer un seuil, et le dire quand on tranche quand même

Un nombre caché derrière un mot rassurant est plus difficile à remettre en
cause qu'un nombre affiché.

Distinction qui décide :

- un seuil qui change **ce qui est calculé** (tolérance de matching, vitesse,
  précision) ne s'invente pas. S'il manque des données pour le fixer, on
  livre le reste et on écrit ce qu'il faudrait pour trancher ;
- un seuil qui ne change que **la façon dont un résultat est présenté**
  (étoiles, paliers d'affichage) peut se trancher au jugement — à condition
  de l'écrire dans le code, avec les pistes envisagées et écartées.

J'ai refusé d'inventer les valeurs de #174 et posé celles des étoiles au
jugé sans le dire, dans le même sprint. L'incohérence était réelle.

## 3. Une correction de texte se fait sur toutes les surfaces

Il y en a plus qu'on ne croit : `About.tsx`, `public/pourquoi.html`,
`EmptyState.tsx`, l'en-tête d'`App.tsx`, le **README**, les docs.

L'issue #168 en a corrigé trois et oublié le README — la première chose que
lit quelqu'un qui arrive sur le dépôt. Aucune revue de diff ne pouvait
l'attraper : le README n'était dans aucun diff.

**`grep` sur la formule, pas sur le fichier.**

## 4. Une garde transverse se nomme, elle ne se recopie pas

Trois gardes de démonstration écrites à la main, une quatrième oubliée
(`importerSauvegarde`) — et la PR affirmait avoir couvert « les trois
chemins ». Il y en avait quatre.

Dès qu'une condition doit être consultée par plusieurs actions, elle devient
une fonction nommée. C'est le seul remède connu à ce mode d'échec.

## 5. Ce qu'on affirme dans une PR, on l'a vérifié

J'ai écrit « la démonstration fonctionne hors ligne » sans l'avoir testé.
C'était faux : le fichier n'était pas précaché.

Une description de PR est un engagement, pas une intention. Si une phrase
commence par « fonctionne », « garantit » ou « couvre », soit il y a une
commande ou un test derrière, soit la phrase change.

## 6. Le protocole de développement

Un item par PR. TDD sur `src/core`. Commits en français.

**La porte complète avant de committer** — `/porte` la lance :
`lint`, `typecheck`, `coverage`, `build`, `e2e`, `monkey`.

Trois pièges mesurés sur ce dépôt :

- **`npx tsc --noEmit` ne vérifie rien ici.** Le projet utilise les
  références de projet : il faut `npx tsc -b --noEmit`. J'ai utilisé la
  mauvaise commande pendant toute une session sans m'en apercevoir — c'est
  le build qui rattrapait mes erreurs.
- **Rebuild obligatoire avant les e2e** : Playwright sert `dist/`, pas les
  sources. Un `npm run build` dont on masque la sortie peut échouer en
  silence et laisser tester une version périmée.
- **`--workers=1`** pour la suite e2e, et
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## 7. Le déploiement se vérifie avant, pas après

Ne rien empiler sur un `main` rouge. Le hook de démarrage l'annonce quand il
le peut ; quand il ne le peut pas, il le dit — et c'est alors à moi de
regarder.

## 8. Après chaque sprint, une revue ; après le cycle, une vraie revue globale

`/revue-sprint` relit le diff en cherchant ce qu'on y a cassé.
`/revue-globale` regarde l'application, pas les diffs — c'est là que se
trouvent le README oublié, les deux jetons de couleur nés entre deux
sprints, et la dette qui a grossi.

**Ne pas appeler « globale » une revue transversale des diffs.** Je l'ai
fait ; le nom promettait plus que le contenu.

## 9. Ce qui vaut arrêt

- Un test du calcul de complétion qui devient rouge.
- Un déploiement rouge non corrigé dans la journée.
- Une session utilisateur qui infirme une hypothèse : on replanifie, on ne
  pousse pas.

## 10. Ce qu'on ne ferme pas en prétendant l'avoir fini

Certaines issues demandent une preuve humaine — #173 exige que Théo et
Jeanine mènent une tâche sans aide. Le code peut être fini quand l'issue ne
l'est pas. Le dire dans la PR plutôt que laisser le `Closes` parler.
