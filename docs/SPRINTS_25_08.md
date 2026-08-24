# Vingt sprints — nuit du 24 au 25/08

Demandé par Cédric : dix sprints, puis « monte à 20 même ». Exécutés
d'affilée, avec **une revue de persona entre chaque** et une **revue
globale** à la fin.

Les vingt ne sortent pas d'un chapeau. Ils viennent du backlog ouvert, des
questions que Cédric a posées le 24/08 au soir (Pilat, Club Vosgien,
villages), et des dettes que les revues précédentes ont nommées sans les
solder. Chacun ferme au moins une issue et se juge sur ce qu'un persona
donné arrive — ou n'arrive pas — à faire après.

## La règle du jeu

Un sprint n'est réputé fini que si :

1. la porte complète est verte **avant** le commit — `lint`, `tsc -b
   --noEmit`, `coverage`, `build`, `e2e --workers=1`, `monkey` ;
2. tout test ajouté après coup a été vu **rouge sans son correctif**
   (CLAUDE.md §1) ;
3. la revue de persona qui suit est écrite ici, avec ce qui bloque encore.

Une revue de persona n'est pas un satisfecit. Elle cherche ce que la
personne ne peut toujours pas faire.

## Le plan

| # | Sprint | Ferme | Persona qui juge |
|---|---|---|---|
| 1 | « PR » n'est plus une corbeille | #284 | Sylvie, Marc |
| 2 | Le balisage tel qu'il est peint sur l'arbre | #286 | Anne-Marie *(nouvelle)*, Marc |
| 3 | Un contrôle qui a déjà répondu ne garde plus rien | — | Bernard |
| 4 | Le terrain décide qui peut y aller | #179 | Nadia *(nouvelle)*, Bernard |
| 4bis | Ce qu'il y a au village | #285 | Camille, Bernard |
| 5 | Filtrer par ce qu'il y a sur le chemin | #156 | Sylvie |
| 6 | Cent sorties restent lisibles | #175 | Karim |
| 7 | Prévenir quand on quitte le parcours | #154 | Camille |
| 8 | Troisième tranche du store | #155 | Bernard *(vieux téléphone)* |
| 9 | Le poids de la carte | #93 | Sylvie *(4G en fond de vallée)* |
| 10 | La confidentialité se voit, pas seulement s'écrit | #178 | Léa, Bernard |
| 11 | Les PDIPR départementaux, source officielle | #87 | Marc, Léa |
| 12 | L'API Geotrek du Pilat : la preuve du balisage | #88 | Marc |
| 13 | Les PR manquants du Rhône : pourquoi | #20 | Sylvie |
| 14 | Quatre onglets au lieu de dix sections | #171 | Bernard, Sylvie |
| 15 | Chercher une sortie par lieu, sans envoyer sa position | #206 | Léa |
| 16 | Le corpus de vitesse, ou l'aveu qu'il manque | #150 / #204 | Karim |
| 17 | Ce que la démonstration promet et ne tient pas | #157 | Sylvie |
| 18 | Renommer le dépôt, et ce qui casse si on l'oublie | #162 | Léa |
| 19 | Vague de mutation sur tout ce que la nuit a écrit | — | *(l'outil juge)* |
| 20 | La balise blanc/rouge dans l'identité : le point juridique | #2 | Léa |

Puis **revue globale** : l'application, pas les diffs.

## Ce que je ne promets pas

Vingt sprints, c'est plus qu'une nuit — chaque porte complète coûte quinze
minutes de mesure, avant même d'écrire une ligne. L'ordre est celui-ci parce
que les quatre premiers répondent à des questions posées, les six suivants
vont du plus visible au plus technique, et les dix derniers soldent des
dettes que les revues ont déjà nommées.

**Je n'en rétrécirai aucun pour pouvoir en cocher vingt.** Si la nuit
s'arrête au huitième, ce sera écrit ici, avec ce qui restait à faire. Un
sprint dont la porte n'est pas verte n'est pas un sprint fait, et un sprint
sans sa revue de persona n'est pas un sprint fini.

Trois d'entre eux dépendent d'une mesure que je ne peux pas prendre : le
proxy sortant de cet environnement refuse `overpass-api.de` et les API
Geotrek. Les sprints 11, 12 et 13 iront donc jusqu'au code et aux tests sur
donnée simulée, et s'arrêteront à l'endroit exact où il faut de la vraie
donnée — en le disant, plutôt qu'en inventant des chiffres (§2).

---

## Sprint 1 — « PR » n'est plus une corbeille

**Ferme #284.** `classifyNetwork` renvoyait `PR` pour tout ce qui n'était ni
`nwn`, ni `rwn`, ni `lwn`, ni préfixé « GR ». À côté, `About.tsx` expliquait
que le jaune veut dire « Promenade et Randonnée », marque FFRandonnée. Un
tracé qu'un particulier a saisi pour lui ressortait donc comme un circuit
balisé officiel.

**Livré.** `INCONNU` existe : libellé « Réseau non déclaré », badge « ? »,
couleur `#882a5a` cherchée par calcul sous les vingt et une couleurs déjà
prises. Un ref « PR 12 », qui arrivait sur `PR` par accident en traversant
le repli, a désormais sa branche explicite.

### Revue — Sylvie, 29 ans, débute, téléphone uniquement

Elle ouvre le Pilat. Une partie des tracés est prune, avec un badge « ? ».
Elle appuie dessus : « OpenStreetMap ne déclare aucun réseau pour cet
itinéraire. Ce peut être un PR balisé que personne n'a qualifié, comme un
tracé sans le moindre balisage sur le terrain : à vérifier avant de partir. »

C'est honnête, et **c'est un mur**. Sylvie ne sait pas vérifier. Elle n'a ni
carte IGN, ni topo-guide, ni le réflexe d'aller voir sur un autre site. La
phrase lui dit qu'il y a un risque et la laisse seule avec.

**Ce qu'elle ne peut toujours pas faire :** choisir. Le filtre lui permet
d'écarter les « ? » — c'est déjà ça — mais si le Pilat en est plein, écarter
revient à ne rien avoir. Il lui faudrait une **seconde source** qui tranche :
c'est exactement #88 (Geotrek du PNR) et #87 (PDIPR). Sprints 11 et 12.

**Ce qui a changé pour elle :** elle ne partira plus sur un layon en croyant
que c'est la balade du dimanche. Le mur est préférable au piège.

### Revue — Marc, 55 ans, baliseur bénévole

Marc, lui, est content : il sait ce qu'est un vrai PR, et voir l'application
cesser de galvauder le sigle le réconcilie avec elle.

Mais il pointe autre chose, et il a raison. **Le badge « ? » ne dit pas
laquelle des deux ignorances c'est.** Une relation sans aucun tag et une
relation richement décrite mais sans `network` sont deux situations très
différentes : la seconde est probablement un vrai itinéraire qu'un
contributeur n'a pas fini de qualifier, la première ne veut rien dire.
Sentiers les met dans le même sac.

**Ce qu'il ne peut toujours pas faire :** repérer, depuis l'application, les
relations qu'il pourrait aller corriger dans OSM lui-même. Il faudrait un
lien « qualifier cet itinéraire » vers l'éditeur — noté, hors périmètre de
cette nuit, à ouvrir comme issue.

### Ce que la revue déplace dans le plan

Rien dans l'ordre. Mais elle confirme que les sprints 11 et 12 ne sont pas
des à-côtés : ils sont **la suite obligée** du sprint 1. Dire « je ne sais
pas » est un progrès seulement si quelqu'un finit par savoir.


---

## Sprint 2 — Le balisage tel qu'il est peint sur l'arbre

**Ferme #286.** Trois choses :

- `src/core/balisage.ts` lit `osmc:symbol`, la notation standardisée d'OSM
  pour ce qui est réellement peint, et la **traduit** en français —
  « rectangle rouge sur fond blanc ». Elle ne l'interprète pas : en déduire
  « donc c'est un PR » referait l'erreur de #284 dans l'autre sens ;
- la fiche affiche cette ligne, avec l'organisme qui balise quand OSM le
  nomme — et **rien du tout** quand la forme ou la couleur ne sont pas dans
  la table. Une fiche muette est exacte ; une fiche approximative envoie
  chercher une marque qui n'existe pas ;
- les cinq départements du massif vosgien sont chargeables (88, 68, 67, 57,
  70).

Deux choses trouvées en chemin :

- **une ligne de code écrite pour rien.** L'heuristique qui distingue le
  texte d'une balise d'un second symbole était juste, mais aucun test ne
  l'atteignait : mes trois cas plaçaient tous le texte en quatrième position.
  Une injection remplaçant l'heuristique par `champs[3]` restait verte. C'est
  du TDD sincère — le module n'existait pas quand les tests ont été écrits —
  et le §1 l'a quand même pris en défaut ;
- **le garde-fou du `dist/` périmé a un trou**, et je suis tombé dedans en
  vérifiant ce sprint. Voir sprint 3.

### Revue — Anne-Marie, 58 ans, Munster

Elle charge le Haut-Rhin. Le massif est là, ce qui n'était pas le cas hier.
Elle ouvre un sentier qu'elle connaît : « Balisé : rectangle rouge sur fond
blanc — Club Vosgien ». C'est exactement ce qu'elle verra sur l'arbre, et
c'est la première fois qu'une application le lui dit.

**Ce qu'elle ne peut toujours pas faire, et c'est important :** s'y
retrouver sur la carte. Le tracé reste peint selon la taxonomie fédérale —
prune s'il n'a pas de `network`, jaune s'il porte `lwn`. Elle lit « rectangle
rouge » dans la fiche et voit une ligne jaune sur la carte. **La fiche dit
vrai, la carte dit encore faux**, et c'est la carte qu'on regarde en
marchant.

Peindre le tracé de la couleur de son balisage réel est la suite évidente.
Ce n'est pas dans ce sprint parce que ça demande de décider quoi faire quand
`osmc:symbol` manque (la majorité des cas, probablement) et quoi faire d'un
balisage bicolore. À ouvrir comme issue, pas à bâcler ce soir.

**Ce qu'elle ne demande toujours pas :** qu'on traduise son losange en
GR/GRP/PR. Sur ce point, elle est servie.

### Revue — Marc, 55 ans, baliseur bénévole

Marc trouve la traduction correcte et la prudence bien placée : rendre
`null` plutôt qu'un mot approximatif, c'est ce qu'il aurait fait.

Il pointe une limite réelle : **la table des formes est courte**. Vingt
symboles, alors qu'`osmc:symbol` en compte plus du double, et les
combinaisons à deux symboles ne sont pas décrites du tout — seul le premier
plan est lu. Un sentier balisé « rectangle rouge **et** disque blanc » sera
décrit comme un simple rectangle rouge.

Ce n'est pas faux, c'est incomplet, et l'incomplétude est silencieuse : rien
à l'écran ne dit qu'un second symbole a été ignoré. **C'est le mode d'échec
que le dépôt connaît le mieux** — une omission qui a l'air d'une réponse.

À corriger : soit décrire les deux symboles, soit dire qu'il y en a un
second. Noté pour la revue globale.


---

## Sprint 3 — Un contrôle qui a déjà répondu ne garde plus rien

**Pas d'issue : ce sprint s'est écrit tout seul, en tombant dans le piège.**

En vérifiant le §1 du sprint 2 — réinjecter les défauts, regarder les tests
virer au rouge — les trois tests sont restés **verts**. Le motif était celui
que le dépôt documente depuis deux jours : `dist/` périmé. Sauf que le
garde-fou censé l'empêcher, `.claude/hooks/dist-a-jour.sh`, n'avait rien vu.

Il ne pouvait pas. Un hook `PreToolUse` juge la commande **avant** qu'elle
s'exécute, et ma commande faisait les deux :

```
python3 - <<'PY' ...réinjecte les défauts... PY
npm run build && npx playwright test
```

Au moment du contrôle, `dist/` était encore à jour. Les sources n'ont été
modifiées qu'ensuite, par la commande qu'il venait d'autoriser. `tsc -b` a
échoué sur deux imports devenus inutiles, `dist/` est resté en arrière, et
trois tests ont prouvé le contraire de ce qu'on leur demandait — **pendant
la vérification du §1**, c'est-à-dire à l'endroit précis où je me croyais le
plus prudent.

Le contrôle vit désormais dans `globalSetup`, à l'intérieur du processus
Playwright : plus d'intervalle entre la vérification et l'usage. Vérifié en
touchant une source et en relançant dans le même appel — il refuse.

Le hook reste : il refuse plus tôt, avec un meilleur message, et évite
d'attendre le démarrage du serveur. Les deux couvrent deux instants
différents ; ce n'est pas un doublon.

**Un second piège, trouvé une heure après.** J'ai reconstruit `dist/`
pendant qu'une porte tournait. `npm run preview` sert `dist/` depuis le
disque à chaque requête : l'application a changé **sous** les tests en
cours. Les résultats de cette porte ont été jetés, pas discutés. C'est écrit
dans CLAUDE.md §6quater — une porte est indivisible, tant qu'elle tourne
l'arbre ne bouge pas.

### Revue — Bernard, 62 ans, Saint-Chamond

Bernard ne verra jamais ce sprint. Aucun pixel ne bouge pour lui.

C'est pourtant lui qui en paie le prix quand il manque : un test qui passe
au vert sur une version périmée, c'est une régression qui part en
production, et c'est Bernard qui la trouve — sur son téléphone, un dimanche
matin, au moment de partir.

**Ce qu'il ne peut toujours pas faire :** rien de nouveau. Ce sprint ne lui
donne rien. Il rend seulement crédibles les dix-sept qui suivent — et deux
de ceux qui précèdent auraient pu être faux sans qu'on le sache.

C'est le seul sprint de la liste dont la valeur se mesure en **erreurs qui
n'arriveront pas**, ce qui est aussi la raison pour laquelle ce genre de
travail se remet toujours à plus tard.
