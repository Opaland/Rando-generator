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

## 1bis. Playwright appelle « visible » des choses que personne ne voit

Trois fois dans la nuit du 22 au 23/08, un test est resté vert alors que le
défaut était remis. Trois fois la même cause : **une assertion sur le DOM
répondait à une autre question que celle qu'on croyait poser.**

- **`toBeVisible` accepte un élément écrêté** par un ancêtre en
  `overflow: hidden`. Le contenu d'une feuille repliée garde un rectangle non
  vide : les quatre tests du constat U3 passaient sur un panneau haut de
  52 px qui ne montrait rien.
- **`toContainText` lit le `textContent`, `display: none` compris.** « Rien
  ne parle de glisser » était affirmé sur un texte parfaitement présent
  (constat U12).
- **Une mesure prise pendant une transition ne dit rien de l'état final.** La
  feuille met 0,2 s à changer de hauteur alors que `data-position` change
  tout de suite : on relevait 821 px là où elle en fait 52. Deux fois, dans
  deux constats différents.

Ce qu'il faut demander à la place :

- « qu'est-ce qui est **peint** ici ? » — `document.elementFromPoint` au
  centre de l'élément, comparé à l'élément lui-même. C'est la mesure qui a
  établi U1, U3 et U4, et c'est `estAlEcran` dans `tests/e2e/helpers.ts` ;
- pour un texte qui doit disparaître, viser sa **visibilité** et non la
  présence du mot ;
- envelopper toute mesure d'un `expect.poll` quand une transition CSS peut
  courir.

La règle générale, dont ceci n'est qu'un cas : **une assertion qui pourrait
passer pour une raison qu'on n'a pas voulue n'est pas une assertion.**

**Et le piège se referme aussi sur les mesures jetables.** Le 24/08, j'ai
compté « soixante-dix textes sous 14 px » sur une fenêtre de 390 px pilotée à
la souris, et j'allais rapporter à Cédric un défaut inexistant plus une phrase
prétendue fausse dans `core/affichage.ts`. Le plancher vit sous
`@media (pointer: coarse)` : au doigt il en restait **quatre**, tous nommés
comme exclusions dans le CSS. J'avais cité ce paragraphe une heure plus tôt.

Une sonde jetable ne passe par aucune revue, aucune porte, aucune
réinjection — c'est donc celle qui a le plus besoin d'être configurée comme
la vraie. `hasTouch`, la largeur, l'état, la taille de texte : les quatre se
posent avant de lire le premier chiffre, pas après l'avoir trouvé
surprenant.

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

## 4bis. Un commentaire qui justifie une existence est une affirmation

Trois trouvés faux dans la même journée, sur des sujets sans rapport :

- « Exporté pour les tests » — aucun test ne s'en servait ;
- « Tracé de l'utilisateur : rien à attribuer, c'est le sien » — faux pour un
  PDIPR importé, et c'était une violation de licence ;
- « relit la base, donc rien n'est perdu » — ne relisait pas les
  déclarations, arrivées après lui.

**Aucun n'était faux quand il a été écrit.** C'est ce qui les rend
dangereux : une justification vieillit comme le reste, mais personne ne la
relit, parce qu'elle a l'air d'expliquer plutôt que d'affirmer.

Le remède n'est pas d'en écrire moins — ces commentaires portent le pourquoi,
et c'est ce qui manque partout ailleurs. C'est de les traiter comme des
assertions : quand une phrase dit « parce que X », **X se vérifie**, et de
préférence par un test plutôt que par une relecture.
## 4ter. Deux listes qui disent la même règle ont le même trou

Le 25/08, deux défauts trouvés dans la même heure, sur des sujets sans
rapport, avec la même forme :

- la liste des commandes plancherisées par `src/index.css` et celle mesurée
  par la question 4 de `regles-d-ecran.spec.ts` étaient **la même liste,
  écrite deux fois** — et il y manquait `select`, `input` et `textarea` des
  deux côtés. Vingt-cinq commandes du dépôt n'étaient ni tenues ni
  surveillées, et deux boutons radio faisaient 22 px ;
- la distance cumulée le long d'un itinéraire se calculait **trois fois**,
  par trois chemins. Sur une relation OSM désordonnée — le cas ordinaire —
  les trois rendent 4 685 m, 10 931 m et un troisième nombre (#303).

Aucun des deux n'était visible dans un diff. **Les deux fichiers ne changent
jamais ensemble, et chacun paraît complet quand on le lit seul.**

C'est le §4 vu depuis l'autre bout. Le §4 dit de nommer une garde plutôt que
de la recopier — mais on ne sait pas qu'on recopie au moment où on le fait,
et après, plus personne ne le voit.

Trois issues, dans cet ordre :

1. **une fonction nommée** appelée des deux côtés ;
2. **un test qui asserte que les deux sont d'accord**, quand elles ne peuvent
   pas être partagées — du CSS et du TypeScript ne s'importent pas.
   `scripts/listes-jumelles.mjs` fait exactement ça, tourne dans `npm run
   listes`, et échoue en nommant le genre manquant ;
3. **une issue**, quand décider laquelle a raison change ce qui est calculé
   (§2).

Et jamais un commentaire disant « penser à mettre à jour l'autre » : le
§6quater est formel, s'il faut le lire il ne garde rien.

---

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

## 6bis. La mutation trouve les tests creux que je ne vois pas

Trois tests creux trouvés à la main dans une seule session, et un quatrième
que seul l'outil a vu : une assertion `/200|204/` qui acceptait « 2040 »,
c'est-à-dire un arrondi remplacé par une multiplication.

`npm run mutation` casse le code exprès et regarde si les tests s'en
aperçoivent. Première vague sur sept modules : score 78 %, et parmi les
survivants deux vraies lacunes — une soustraction devenue addition dans le
calcul de pente, une fusion de bandes qui pouvait finir avant de commencer.
Aucune des deux n'était visible en relisant.

Ce n'est pas une porte : c'est trop lent pour chaque commit, et un survivant
n'est pas toujours un défaut (une table de traduction en produit des dizaines
sans intérêt). C'est une vague à lancer après un module neuf, et à lire en
cherchant les survivants qui *changent un résultat*.

**Deuxième vague, 23/08, sept modules de la journée : 83,9 %, 111 survivants.**
Onze changeaient un résultat, et trois choses valent d'être retenues :

- **un survivant m'a montré que mon propre test ne pouvait pas échouer.**
  J'avais écrit l'assertion sur l'étape 1, dont le départ est zéro : `fin + 0`
  et `fin − 0` donnent le même nombre. Le §1 dit d'enlever le correctif ; ici
  c'est l'outil qui l'a fait à ma place, et il a eu raison contre moi ;
- **deux mutants ont survécu à trois tests successifs**, chaque survie disant
  que le cas atteint n'était pas celui que je croyais écrire. La garde ne
  devient atteignable qu'au second tour de boucle, ou sur une dernière étape
  courte. Un test qui vise une ligne sans l'atteindre est vert pour rien ;
- **trois survivants sont équivalents** — le même résultat par un autre
  chemin. Ils sont écrits comme tels dans le test, pour qu'on ne les rechasse
  pas à la vague suivante. Dire d'un survivant qu'il n'en est pas un fait
  partie de la lecture.

Le plus utile n'était pas un calcul mais une ancre : `/^https?:\/\//` privée de
son `^` accepte `javascript:alert(1)#https://x`, et cette adresse part dans un
`href`.

## 6ter. Un test qui suppose un ordre échoue seulement en suite complète

Deux courses trouvées le même jour, dans des fichiers sans rapport :
`fermerLeGuide` vérifiait la présence du guide **puis** cliquait ; un test de
miroir posait sa fonction de relâchement depuis le gestionnaire de route et
l'appelait avec `?.()` — sans effet, en silence, s'il n'avait pas encore
tourné.

Les deux n'échouaient **que sur la suite complète**, jamais isolées : la
fenêtre ne s'ouvre que sous charge. C'est la signature de cette famille, et
elle se reconnaît avant de chercher la cause.

Le remède est le même dans les deux cas : **cesser de chercher un ordre sûr,
boucler sur l'état final voulu.** Un `catch` dans une telle boucle n'avale pas
une assertion — il avale une tentative, dans une convergence qui, elle, est
assertée.

---

## 6quater. Un contrôle qu'il faut penser à lire ne garde rien

`dist/` est servi par Playwright, pas les sources. Le §6 le dit, et la
parade était « vérifier `✓ built` dans la sortie ».

Dans la nuit du 23 au 24/08, le piège s'est refermé **trois fois** :

- une injection de défaut a cassé `tsc -b` ; `dist/` est resté à la version
  d'avant et le test est passé au vert en prouvant le contraire de ce qu'on
  lui demandait ;
- un import inutilisé a cassé le build pendant quatre commandes de suite.
  **J'ai vu l'erreur, je l'ai lue, et j'ai continué** ;
- une correction de point de rupture a paru sans effet vingt minutes durant,
  pour la même raison.

La leçon n'est pas « mieux vérifier ». C'est que la vérification était à la
charge de celui qui a déjà tort. `.claude/hooks/dist-a-jour.sh` refuse
maintenant de lancer Playwright sur un `dist/` plus vieux que les sources.

Ce qui vaut pour tout garde-fou : **s'il faut le lire, il ne garde rien.**

**Et le 25/08, ce garde-fou-là s'est fait avoir à son tour.** Un hook
`PreToolUse` juge la commande *avant* qu'elle s'exécute — or une seule
commande peut modifier les sources **puis** lancer Playwright : un
`python3 - <<PY` qui réécrit un fichier, suivi d'un `npm run build && npx
playwright test`.

Au moment où le hook regarde, `dist/` est encore à jour : les sources ne
seront modifiées qu'une milliseconde plus tard, par la commande qu'il vient
d'autoriser. Le build a échoué sur deux imports devenus inutiles, `dist/`
est resté à la version d'avant, et trois tests sont passés au vert en
prouvant le contraire de ce qu'on leur demandait — pendant une vérification
du §1, c'est-à-dire à l'endroit exact où l'on se croyait le plus prudent.

La parade est dans `playwright.config.ts` : `globalSetup` s'exécute **dans**
le processus de test, au démarrage. Il n'y a plus d'intervalle entre la
vérification et l'usage. Le hook garde sa raison d'être — il refuse plus
tôt, avec un message plus utile — mais il ne pouvait pas être le seul.

La leçon générale : **un contrôle placé avant l'action ne garde que ce que
l'action n'a pas encore changé.** Quand une même commande fait les deux, le
contrôle doit vivre là où l'action se produit.

**Corollaire, trouvé une heure plus tard le même jour : ne jamais
reconstruire pendant qu'une porte tourne.** `npm run preview` sert `dist/`
depuis le disque, à chaque requête — pas une copie prise au démarrage. Un
`npm run build` lancé pendant les e2e change donc l'application **sous** les
tests en cours : ceux d'avant ont éprouvé une version, ceux d'après une
autre, et rien dans le rapport ne dit où passe la frontière.

Le contrôle du démarrage ne peut rien contre ça — il a déjà répondu, et il
avait raison au moment où il a répondu. La seule parade est de tenir une
porte pour indivisible : tant qu'elle tourne, l'arbre ne bouge pas. Un
résultat obtenu autrement se jette, il ne se discute pas.

## 6quinquies. Un test qui ne regarde qu'un écran ne garde qu'un écran

Les règles d'écran (`tests/e2e/regles-d-ecran.spec.ts`) posent cinq
questions mesurables — qu'est-ce qui est peint par-dessus quoi, qu'est-ce
qui est écrasé, qu'est-ce qui déborde sans le dire, qu'est-ce qu'on ne peut
pas toucher, qu'est-ce qui sort du cadre — à trois largeurs et dans six
états.

Les états ne sont pas décoratifs. La première version n'auscultait
que l'écran d'accueil : une injection remettant le profil écrasé passait au
vert, parce que le profil n'existe pas encore à ce moment-là. Élargie aux
états, la même sonde a trouvé du neuf le jour même — les cinq commandes de
zoom du profil, à 28 px.

**Une sonde se juge sur ce qu'elle trouve quand on remet un défaut, pas sur
le nombre de ses assertions.**

Le 25/08, un sixième état est arrivé par le même chemin : le panneau
« Trouver une sortie » est un `<details>` **replié par défaut**, qu'aucun des
cinq n'ouvrait. Ses seize commandes n'avaient jamais été mesurées. Élargie,
la sonde a trouvé du neuf le jour même — deux boutons radio à 22 px, sous le
plancher de 24 px de WCAG 2.5.8. **Ce qui est replié par défaut est ce qu'une
sonde oublie par défaut.**

## 6sexies. Ce qui est mesurable se mesure ; le reste se décide, et se dit

L'audit d'interface ne dit pas si une couleur est jolie ni si un texte est
clair : ces choses se décident. Il ne garde que ce qui a une réponse en
chiffres — un contraste, un ΔE, une hauteur en pixels, un rectangle peint.

Et quand un seuil vient d'une norme publiée, on la nomme : 44 px est
WCAG 2.5.5, 24 px est WCAG 2.5.8. Le seul nombre tranché au jugement dans
tout le plancher des cibles est le 32 px du curseur, et il est écrit comme
tel. Un seuil emprunté n'a pas le même statut qu'un seuil inventé, et
confondre les deux est ce que le §2 interdit.

---

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
