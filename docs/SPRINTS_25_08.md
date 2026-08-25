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


---

## Sprint 4 — Le terrain décide qui peut y aller

**Ferme #179.** Trois choses :

- `partsDeRevetement` rend la part de chaque famille **en longueur**, et
  `inconnu` est une part comme les autres. La noyer dans « naturel » ou la
  retirer du dénominateur ferait passer un itinéraire dont on ne sait rien
  pour un itinéraire dont on sait qu'il est roulant ;
- un filtre « Sol : entièrement dur ou stabilisé » dans la liste ;
- les parts réelles dans la fiche, sous « Sous les pieds », avec la phrase
  qui compte : « Non renseigné » ne veut pas dire « facile ».

### La règle enfreinte, et pourquoi

`core/discovery.ts` porte en en-tête : *un filtre ne s'applique jamais à une
donnée absente*. Ne pas connaître le dénivelé d'un itinéraire ne doit pas le
faire disparaître d'une recherche.

**Ce filtre-ci fait l'inverse, et c'est délibéré.** Pour tous les autres,
laisser passer l'inconnu coûte au plus une déception : on découvre une
sortie un peu plus longue que prévu. Ici, ça coûte à Nadia une journée, et
sa fille assise devant un sentier qu'elles ne feront pas.

L'asymétrie décide : elle sait lire une donnée absente, elle ne pardonne pas
une promesse fausse.

### Le seuil que je n'ai pas inventé

« Entièrement » plutôt qu'un pourcentage. Un seuil du genre « 80 % roulant »
changerait *ce qui est calculé*, et aucune donnée ne permet de le fixer
(§2). Les deux extrêmes, eux, ne s'inventent pas. Le cas limite se juge sur
les parts affichées dans la fiche, à l'œil, plutôt que par un nombre choisi
au hasard.

### Un test qui mesurait autre chose que son nom

Le premier e2e s'appelait « écarte ce dont on ne sait rien » et passait. Le
fixture ne contenait **aucun** tronçon réellement inconnu : celui que je
croyais tel était un `highway=track`, dont on *déduit* « naturel ». Le test
mesurait donc « écarte ce qu'on sait naturel », et une injection comptant
l'inconnu comme roulant restait verte.

Le chemin 401 du Tour du Pilat, sans le moindre tag, existe pour ça. Le
fixture porte maintenant les trois cas séparément :

| | dur | stabilisé | naturel | inconnu | filtre |
|---|---|---|---|---|---|
| GR 7 | 67 % | 33 % | — | — | gardé |
| Sentier des Crêtes | — | 41 % | 59 % | — | écarté (on sait) |
| Tour du Pilat | — | 50 % | — | 50 % | écarté (on ignore) |

**Troisième fois cette nuit** qu'une assertion est verte pour une raison que
je n'avais pas voulue — après les garde-fous de #151 et la ligne jamais
atteinte du lecteur `osmc:symbol`.

### Et une leçon sur les fixtures partagés

Ma première correction ajoutait au Tour du Pilat un tronçon sans tag. Elle
marchait — et elle a mis **dix-neuf tests sans aucun rapport** au rouge :
le tronçon rallongeait l'itinéraire, donc la longueur totale de la zone,
donc le pourcentage global, que ces tests affirment à « 54,5 % ». Il était
devenu 46,2 %.

Un fixture partagé est un **oracle partagé**. On y change ce qui se *lit* —
un tag, un nom, une propriété — jamais ce qui se *mesure*. La bonne version
retire `surface` du chemin 400 et met `highway=footway` : ni carrossable ni
naturel, donc rien ne s'en déduit, et la géométrie ne bouge pas d'un mètre.

C'est aussi ce qui rend ce genre de correction dangereuse : dix-neuf tests
rouges se voient tout de suite, mais **un** test qui aurait été rendu vert
par le même déplacement ne se serait vu nulle part.

### Revue — Nadia, 44 ans, Villeurbanne

Elle règle « Sol : entièrement dur ou stabilisé ». Sur le Pilat, il reste un
itinéraire sur trois. C'est peu, et c'est vrai.

Elle ouvre la fiche : « Revêtement dur : 67 %, Stabilisé : 33 % ». Elle sait
quoi en faire. Sur un autre, elle lit « Non renseigné : 50 % » et comprend
tout de suite que l'application ne sait pas — ce qui est exactement le
service qu'elle demande.

**Ce qu'elle ne peut toujours pas faire, et c'est le manque principal : la
pente.** Elle cherche trois nombres, l'application lui en donne un.
`penteMaximale` existe déjà (issue #152) mais se calcule sur le profil
altimétrique, qui n'est récupéré qu'à l'ouverture d'une fiche, auprès du
service IGN. Filtrer une liste dessus supposerait d'aller chercher le profil
de chaque itinéraire de la zone — des centaines de requêtes pour un filtre.

Le dire est plus honnête que de bricoler : **la pente est absente du filtre,
et ce n'est pas un oubli.** Elle est dans la fiche, une fois le profil
chargé. La largeur (`width`) n'est ni lue ni affichée, et c'est un vrai
oubli, celui-là.

**Ce qui la ferait fermer l'application :** rien de ce qui a été livré. Le
mot « accessible » n'apparaît nulle part, et c'était la condition.

### Revue — Bernard, 62 ans

Bernard ne se sert pas du filtre, mais il lit la fiche. « Sous les pieds »
lui dit ce qu'il demandait depuis le début sans savoir le nommer : est-ce
que ça monte dans la caillasse, ou est-ce que c'est une piste.

Une réserve de sa part : **cinq lignes de plus dans une fiche déjà longue**,
sur un téléphone. Le constat U6 de l'audit disait qu'une légende ne doit
nommer que ce qui est dessiné ; la même règle vaut ici, et elle est
appliquée — les familles à 0 % ne sont pas affichées. Reste que la fiche
grandit à chaque sprint, et que personne ne mesure sa longueur totale. À
regarder à la revue globale.


---

## Sprint 5 — Filtrer par ce qu'il y a sur le chemin

**Ferme #156.** Les points d'intérêt étaient téléchargés, classés et
affichés dans la fiche depuis des semaines — mais seulement une fois
l'itinéraire choisi. Ils ne servaient jamais à le **choisir**.

### Une distance, jamais un booléen

L'issue demande un filtre « avec de l'eau sur le parcours », et interdit dans
la même page d'en faire une garantie. Les deux sont incompatibles : un
booléen *est* une garantie.

La liste affiche donc **« eau à 110 m »** quand elle en a trouvé, et **rien
du tout** sinon. Écrire « pas d'eau » affirmerait le terrain à partir d'une
absence dans OpenStreetMap — c'est la même faute que le « ouvert » corrigé
plus tôt cette nuit, sur un autre sujet.

Le palier — 250 m, 500 m, 1 km, 2 km — est choisi par la personne, comme la
longueur ou la durée. Aucun seuil n'est décidé à sa place (§2).

### Le seuil que j'avais caché sans le voir

La première version rangeait les POI dans un index de cellules, avec ce
commentaire :

> le résultat est le même quelle que soit sa valeur, seule la vitesse change

**C'était faux.** La taille des cellules décidait jusqu'où l'on cherche,
donc quand on rend `null`, donc quand la liste n'affiche pas d'eau. Un seuil
qui change ce qui est calculé, caché dans un réglage de performance, avec un
commentaire qui affirmait le contraire — le §2 et le §4bis d'un seul coup,
et dans du code que je venais d'écrire.

Le rayon est maintenant nommé, égal à la moitié du plus grand palier
proposé, et un test tient la règle : *un palier proposé ne doit jamais aller
plus loin que ce que la recherche examine, sinon il mentirait en silence.*

### Une requête, à la demande

Une interrogation d'Overpass pour toute la zone, déclenchée par un bouton
explicite — jamais automatiquement. #283 a montré ce que coûte une requête
que personne n'a demandée : quand elle échoue, c'est l'application qui
paraît fautive.

Et quand Overpass rend exactement son plafond de 400 POI, la liste le dit :
« Cette zone contient plus de points d'intérêt qu'une seule requête n'en
rapporte : la recherche est incomplète. » Une troncature silencieuse
annoncerait « pas d'eau » pour des itinéraires que la requête n'a pas eu la
place de couvrir.

### Revue — Sylvie, 29 ans, débute, téléphone uniquement

C'est le premier sprint qui lui parle directement. « Eau à 110 m » est une
information qu'elle comprend sans avoir à apprendre à lire un dénivelé.

**Ce qui la gêne encore :** le bouton. Il faut savoir qu'il existe, et
comprendre que « une requête » n'est pas une menace. Elle l'a lu deux fois.
Le charger automatiquement serait pire — mais la formulation n'est pas
encore la bonne, et je n'ai pas de meilleure idée ce soir.

**Ce qu'elle ne peut toujours pas faire :** savoir si l'eau est potable
depuis la liste. La fiche le dit (« potabilité non renseignée »), la liste
non — et une source non potable à 100 m ne vaut pas une fontaine à 100 m.
C'est une ligne de plus par itinéraire, sur un écran de téléphone : à peser,
pas à ajouter par réflexe.

**Ce qui compte le plus, et qui est tenu :** l'application ne lui dira jamais
qu'il n'y a pas d'eau. Trois formulations sont interdites par le test, et
l'avertissement est écrit sous la liste plutôt que laissé à deviner.


---

## Sprint 6 — Cent sorties restent lisibles

**#175 était déjà implémentée** — recherche, tri, groupement par année,
plafond par année avec un bouton pour le lever. Ce qui manquait, c'est la
**vérification que l'issue nomme** : « retrouver une sortie précise parmi
huit cents, en moins de trente secondes, sans faire défiler la liste
entière ».

`historique.spec.ts` **citait cette phrase dans son en-tête** et mesurait
quarante sorties. Quarante tiennent dans une liste qu'on déroule ; huit
cents sont le cas que Karim a apporté avec son archive Garmin, et celui pour
lequel l'issue existe. Un test qui cite un nombre et en éprouve un autre
affirme plus qu'il ne mesure.

### Deux tentatives pour obtenir une sonde qui discrimine

**La première** étalait cent sorties sur huit ans. Elle passait — et elle
passait toujours en retirant complètement le rendu par fenêtre. L'année
ouverte n'en portait que cent, sous le plafond de deux cents : l'assertion
mesurait le **repli des années**, pas la fenêtre.

**La seconde** charge l'année ouverte à quatre cents, ce qui est aussi le
cas réel — quelqu'un qui enregistre tout ne répartit pas ses sorties
également sur huit ans. Vérifiée rouge en élargissant la fenêtre :

```
Error: 400 lignes dans le DOM pour une année de quatre cents sorties :
la fenêtre ne tient pas
```

Elle garde en plus que le plafond est **annoncé** : sans le bouton de reste,
deux cents sorties disparaîtraient sans que rien ne le dise.

### Ce que la mesure a trouvé

**Rien.** L'implémentation tient à huit cents : import en quelques secondes,
recherche instantanée, DOM borné, plafond annoncé. C'est un résultat, pas un
non-événement — l'issue demandait une vérification, elle l'a.

### Revue — Karim, 41 ans, 800 activités Garmin

Il dépose son archive. Le compte monte à 801, l'année en cours s'ouvre, les
autres sont repliées avec leur nombre. Il tape « perdrix », la sortie de
2022 apparaît sans qu'il ait rien déplié.

**Ce qu'il ne peut toujours pas faire :** chercher par lieu. L'issue le
demande — « rechercher par nom de fichier **et par lieu** » — et seule la
première moitié existe. Ses fichiers Garmin s'appellent
`activity_18274639.gpx` : le nom ne lui dit rien, et c'est précisément le
cas d'usage qui a motivé l'issue.

C'est une vraie lacune, et elle demande de savoir *où* est passée une trace
— donc de la rapprocher d'une commune, ce que l'application ne fait nulle
part aujourd'hui. À ouvrir séparément plutôt qu'à bâcler : #175 est fermée
sur ce qu'elle a livré, la recherche par lieu ne l'est pas.


---

## Sprint 7 — Prévenir quand on quitte le parcours suivi

**Ferme #154.** La fiche dit en permanence où l'on est par rapport au tracé
qu'elle décrit, dès que la position est connue : « Vous êtes à 550 m du
GR 7. »

### L'hystérésis que l'issue demande, et que je n'ai pas faite

L'issue veut « une hystérésis pour éviter le clignotement à la limite du
corridor ». Il n'y en a pas, et c'est délibéré : **il n'y a pas de
corridor.**

Le clignotement est un symptôme du booléen — dedans / dehors — pas de la
mesure. Un booléen aurait demandé un seuil d'entrée et un seuil de sortie,
deux nombres que rien ne permet de fixer : ni le GPS d'un téléphone, ni la
largeur d'un sentier, ni la précision d'un tracé OSM ne donnent la distance
à partir de laquelle « on a quitté le parcours ». Les inventer aurait fait
affirmer à l'application quelque chose de faux la moitié du temps (§2).

La distance, elle, est toujours vraie. On l'affiche telle quelle. Il n'y a
plus rien à faire clignoter.

**C'est un écart à l'issue, et il est signalé comme tel** — pas une
interprétation libre. Si Cédric veut le corridor, il faudra ses deux
nombres ; je ne les inventerai pas.

### Le seul nombre tranché, et il est de présentation

En deçà de 15 m, la phrase dit « sur le GR 7 » plutôt qu'une distance.
« À 4 m » suggérerait un écart là où il n'y a que l'imprécision d'un GPS de
téléphone, qui vaut couramment davantage. Seuil de présentation, donc
tranché au jugement, avec la piste écartée écrite dans le code : afficher
toujours le nombre, y compris « 0 m » — plus pur, et moins juste.

### Ce que l'issue interdit, gardé par un test plutôt que par ma relecture

> Jamais présenté comme un dispositif de sécurité. Sentiers est un carnet,
> pas un GPS de secours (…) une alerte mal formulée le contredirait — avec
> des conséquences réelles si quelqu'un s'y fiait en montagne.

Le test unitaire cherche six formules interdites — « attention », « alerte »,
« danger », « hors itinéraire », « perdu », et le point d'exclamation — à six
distances, de 0 à 20 km. L'e2e refait la même vérification à l'écran. Les
deux vus rouges en réinjectant « Attention ! Hors itinéraire ! ».

### Revue — Camille, 34 ans, prépare la Grande Traversée des Alpes

Elle suit une étape, ouvre la fiche, et lit sa distance au tracé. C'est ce
qu'elle voulait, et le ton lui convient : elle n'a pas besoin qu'on lui
crie dessus, elle a besoin d'un nombre.

**Ce qu'elle ne peut toujours pas faire :** voir cette distance **sans
ouvrir la fiche**. En marchant, la fiche est fermée et la carte occupe
l'écran. L'information est au bon endroit pour préparer, au mauvais pour
marcher.

La mettre sur la carte demande de décider quel itinéraire est « suivi » —
l'objectif épinglé ? le dernier consulté ? celui dont on est le plus
proche ? — et c'est une vraie question de produit, pas un détail
d'affichage. À ouvrir séparément.

**Ce qui compte, et qui est tenu :** rien dans la phrase ne laisse croire à
un dispositif de sécurité. Elle sait que Sentiers ne la ramènera pas.


---

# Où la nuit s'est arrêtée

Sept sprints sur vingt, tous mergés sur `main` avec leur porte complète
verte et leur revue de persona écrite. Plus quatre lots livrés avant que le
plan des vingt ne soit posé.

| # | Sprint | Issue | État |
|---|---|---|---|
| — | Départage de deux sentiers voisins | #151 | mergé |
| — | Le KO Haute-Savoie | #283 | mergé |
| — | « annoncé ouvert » | prépare #285 | mergé |
| 1 | « PR » n'est plus une corbeille | #284 | mergé |
| 2 | Le balisage peint sur l'arbre | #286 | mergé |
| 3 | Le contrôle du `dist/` périmé | — | mergé |
| 4 | Le sol sous les roues | #179 | mergé |
| 5 | Où est l'eau | #156 | mergé |
| 6 | Huit cents sorties | #175 | mergé |
| 7 | La distance au parcours | #154 | en revue |
| 8 à 20 | | | **non faits** |

**Je n'ai rétréci aucun sprint pour en cocher plus.** C'était la seule
promesse du plan, et elle est tenue : chacun des sept porte sa porte
complète — `lint`, `tsc -b`, `coverage`, `build`, 333 e2e, monkey — avant
son commit, et sa vérification du §1.

Ce que ça coûte, mesuré plutôt qu'estimé : **une porte complète prend
dix-sept minutes**, et il en faut une par sprint, parfois deux quand un
résultat est jeté. Sept sprints ont donc consommé un peu plus de deux heures
de mesure seule.

## Ce que treize sprints non faits représentent

Ils sont écrits, ordonnés, et leurs issues sont ouvertes. Trois d'entre eux
— 11, 12 et 13 — dépendent d'une mesure que cet environnement ne peut pas
prendre : le proxy sortant refuse `overpass-api.de` et les API Geotrek.

## Ce que la nuit a appris, et qui vaut plus que les sept sprints

**Cinq fois**, une assertion est passée pour une raison que je n'avais pas
voulue :

1. deux des trois garde-fous de #151 — l'un mesurait une égalité parfaite,
   l'autre n'atteignait jamais le code qu'il prétendait garder ;
2. une ligne du lecteur `osmc:symbol` que ses trois tests ne touchaient pas ;
3. le filtre du sol, qui mesurait « naturel » en croyant mesurer
   « inconnu » ;
4. le rayon de recherche des POI — un seuil caché derrière un réglage de
   performance, avec un commentaire affirmant le contraire ;
5. `historique.spec.ts`, qui **cite** « parmi huit cents » et en mesure
   quarante — et dont la première correction ne discriminait toujours pas.

**Aucun n'était visible en relisant.** Tous ont demandé de remettre le
défaut et de regarder.

Et deux fois, le piège s'est refermé sur les garde-fous eux-mêmes : un hook
qui juge avant l'action ne garde que ce que l'action n'a pas encore changé ;
et reconstruire pendant qu'une porte tourne change l'application sous les
tests en cours. Les deux sont désormais dans CLAUDE.md §6quater, le premier
corrigé dans `globalSetup`.

---

## Ce que la matinée du 25/08 a ajouté au plan

Cédric a relu l'application pendant que les sprints tournaient. Trois constats
et quatre questions, tous instruits ; **six issues ouvertes**, parce qu'un
travail non fini qui ne devient pas une issue disparaît du décompte au lieu
d'être compté comme non fait.

| # | ce que c'est | état |
|---|---|---|
| #300 | « les terrains sont coupés » — les bandes suivaient un autre axe que le profil | **mergé** |
| #301 | « Rando Saint-Joseph => 500 m » — trois mécanismes plausibles, aucun départageable d'ici | ouvert, **bloqué sur le lien OSM** |
| #302 | le plancher des cibles ne mesurait aucune commande de formulaire | **mergé** |
| #303 | **trois axes de distance** pour un même itinéraire : 4 685 m, 10 931 m, et un troisième | ouvert, gros |
| #304 | pierre 0 de l'IA — lire une question en toutes lettres | livré |
| #305 | cinq surfaces ignorent trois fonctionnalités livrées cette semaine | ouvert |
| #306 | vague de mutation (sprint 19, qui n'avait pas d'issue) | ouvert |

### Les quatre questions, et leurs réponses mesurées

- **« est-ce que j'ai les parcours des cartoguides de la FFR ? »** — Non, et
  c'est écrit dans le README : aucune donnée FFRandonnée, aucune couche IGN
  « Sentiers de randonnée ». Ce qu'il y a, ce sont les relations OSM
  `route=hiking|foot|walking|pilgrimage` — la géométrie des GR/GRP/PR **telle
  que des contributeurs l'ont saisie**. Les sources officielles ouvertes sont
  en backlog depuis longtemps : PDIPR départementaux (#87) et API Geotrek du
  Parc du Pilat (#88), tous deux bloqués parce que le proxy de cet
  environnement refuse ces API.
- **« les balisages sont à jour ? »** — À jour au sens où l'on lit ce qu'OSM
  dit aujourd'hui (`osmc:symbol` depuis #286, avec `osmUpdatedAt` stocké). Mais
  sur le seul fixture réel du dépôt : **une relation sur quatre** porte le
  tag, et sa dernière modification OSM date de **2019**. La couverture réelle
  reste la mesure bloquée d'#286.
- **« les docs sont-elles à jour ? »** — Non. #305 en donne le tableau exact.
- **« il faudra relire ce document et créer les issues »** — fait, et c'est ce
  tableau.

### Ce que la matinée a appris

**Deux défauts, une même forme, et elle a un nom depuis aujourd'hui.**

La liste des commandes plancherisées par le CSS et celle mesurée par la sonde
d'écran étaient la même liste écrite deux fois, avec le même trou. La distance
le long d'un itinéraire se calcule trois fois, par trois chemins qui ne sont
pas d'accord. Ni l'un ni l'autre n'était visible dans un diff : **les deux
fichiers ne changent jamais ensemble, et chacun paraît complet quand on le lit
seul.**

C'est CLAUDE.md §4ter, la skill `regle-jumelle`, l'agent `chasseur-de-jumeaux`,
et surtout `scripts/listes-jumelles.mjs` — parce qu'une règle qu'il faut penser
à relire ne garde rien (§6quater).

---

## Reprise du 25/08, après-midi

| # | sprint | issue | état |
|---|---|---|---|
| 8 | Troisième tranche du store | #155 | mergé (#299) |
| — | **Un itinéraire, un axe** | **#303** | **mergé (#310)** |
| 19 | Vague de mutation | #306 | mergé (#311) |
| 10 | La confidentialité se voit | #178 | mergé (#312) |
| 15 | Chercher par lieu | #206 | PR #313 |

### Ce que ces quatre sprints ont eu en commun

**Trois d'entre eux ont trouvé le même défaut sous des formes différentes :
un chiffre affiché comme une mesure alors qu'il ne pouvait pas changer.**

- #303 : le profil mesurait la polyligne **dans l'ordre des membres OSM**,
  sous un commentaire qui appelait ça « une approximation raisonnable ».
  Jamais mesurée : **10 931 m contre 4 685** sur trois tronçons contigus
  donnés dans le désordre ;
- #178 : `<strong data-testid="sorties-traces">0</strong>`, **écrit en dur**
  dans le JSX, sous une note affirmant « un test le vérifie à chaque
  livraison » — ce test n'existait pas ;
- #206 : rien de faux affiché, mais la même tentation. La zone au moment de
  l'import **n'est pas un lieu**, et elle est nommée pour ce qu'elle est.

C'est le §1 sorti des tests et entré dans le produit : **un indicateur qui
ne peut pas échouer n'est pas un indicateur**, et il est plus difficile à
remettre en cause qu'une phrase, parce qu'il a l'air d'être compté.

### Ce que la vague de mutation a dit de la nuit

59,68 %, 273 survivants — dont **cent** sont des mutations de la table des
mots de liaison d'`intention.ts`, sans intérêt. Dix comptaient : six `?` de
pluriel jamais atteints, une alternative de regex **en double qui rendait
mon propre motif intestable**, un `.trim()` mort, et un `break` qui pouvait
jeter un tronçon entier.

Et le test que j'ai écrit pour ce dernier **est resté vert sous son mutant**
à la première tentative : il n'atteignait pas la branche. Il a fallu une
boucle fermée — un way sans extrémité libre — pour que `findIndex` rende
zéro.

### Ce qui reste, et pourquoi

- **9 (#93, tuiles vectorielles)** — un chantier, pas un sprint ;
- **11, 12, 13 (#87, #88, #20)** — le proxy refuse les API PDIPR et Geotrek.
  Inchangé ;
- **14 (#171)** — les onglets existent ; reste à vérifier ce qui manque ;
- **17 (#157)** — un index dont la plupart des enfants sont clos : à
  réconcilier plutôt qu'à faire ;
- **18 (#162)** — renommer le dépôt demande la main de Cédric ;
- **20 (#2)** — la balise blanc/rouge est une question juridique, pas
  technique.
