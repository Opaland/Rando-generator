# Positionnement marketing — 17/10/2026

Phase F du plan agentique (`docs/PLAN_AGENTIQUE_16_10.md`), la dernière.
Demande d'origine de Cédric (16/10) : « comment market l'appli, la rendre
sexy ». Ce document répond à la partie « comment en parler » — **recherche
et rédaction seules, aucune action externe.** Rien n'est publié, aucun
compte créé sur un réseau social ou un store, aucun nom de domaine
réservé. C'est un document de décision, comme ceux des phases D et E.

---

## À qui l'application s'adresse réellement

`docs/PERSONAS.md` documente dix-neuf parcours, construits à partir de
défauts réels trouvés en les suivant, pas de profils marketing inventés.
Pour positionner l'application, ils se regroupent en trois audiences —
une segmentation, donc un jugement de l'auteur, pas une mesure :

### 1. Le randonneur régulier qui veut savoir ce qu'il a déjà fait

Bernard (62 ans, retraité, Saint-Chamond), Camille (prépare la GTA),
Karim (rentre de sortie, montre Garmin). C'est le cœur de l'usage :
« combien du GR 7 ai-je vraiment marché ». Aucun d'eux n'a demandé un
classement ni un ami à comparer — chacun veut sa propre réponse, pas un
rang.

### 2. Qui tient à ne pas avoir de compte, par principe autant que par usage

Pas un persona nommé dans `PERSONAS.md`, mais une audience que la
veille concurrentielle du 17/10 rend visible par contraste : quiconque a
déjà renoncé à un tracker parce qu'il fallait un compte Strava
(exactement ce que `trail-progress`, COTACOL et Wandrer demandent tous
les trois, pour trois sports différents — `docs/VEILLE_CONCURRENTIELLE_17_10.md`).
C'est une audience qui se définit par un refus, donc difficile à
nommer par un persona classique — mais c'est elle qui rend le message
« aucun compte » vendable plutôt qu'anecdotique.

### 3. Celui ou celle que l'accessibilité exclut ailleurs

Théo (9 ans), Jeanine (76 ans), Malik (deutéranope, #360), Paul
(imprime tout), Yuki (thème sombre permanent). Cette audience n'achète
pas « plus de fonctionnalités » — elle cherche ce qui ne lui a pas
déjà été refusé par une interface pensée pour quelqu'un d'autre.

**Ce que ce classement ne doit pas cacher** : les trois audiences ne
sont pas mutuellement exclusives, et aucune n'a été constituée par une
étude de marché — c'est une lecture des parcours déjà documentés, pas
un sondage.

---

## Ce qui distingue Sentiers, mesuré plutôt qu'affirmé

Trois phrases candidates, et ce qui les étaye ou les rend fragiles :

### « Aucun compte, aucun serveur » — la plus solide des trois

`docs/VEILLE_CONCURRENTIELLE_17_10.md` l'établit sur trois sports
différents, chez trois éditeurs différents : Wandrer (route), COTACOL
(vélo), `trail-progress` (randonnée, le concept le plus proche de
Sentiers) demandent tous un compte Strava pour mesurer une progression.
Sentiers est la seule approche recensée, sur ces trois sports, qui
répond à la même question sans aucun des deux. C'est une **affirmation
vérifiable** : n'importe qui peut rouvrir l'application hors connexion
et constater qu'elle fonctionne, ou lire `src/` et constater qu'aucune
trace GPX ne part vers un serveur (`tests/e2e/fuite-de-trace.spec.ts`,
`tests/e2e/sorties-reseau.spec.ts` le gardent en continu).

**Fragilité à ne pas cacher** : « aucun serveur » ne se prouve pas à
quelqu'un qui n'a pas le réflexe de vérifier — c'est une promesse de
confiance, pas une fonctionnalité qu'on voit en une capture d'écran. Un
message qui s'arrête là convainc les convaincus (audience 2), pas les
deux autres.

### « La progression sur de vrais sentiers balisés » — solide, mais partagée

Wandrer fait la même chose pour la route (« win by going to new
places »). Ce qui reste propre à Sentiers : le balisage réel
(GR/GRP/PR, pas une route anonyme) et le respect du balisage sur le
terrain plutôt qu'une convention graphique — Anne-Marie (Club Vosgien,
`PERSONAS.md`) est la preuve que ce détail compte pour qui pose le
balisage, pas seulement pour qui le suit.

### « Sexy » — pas une mesure, pas encore une phrase

`docs/PROPOSITIONS_DESIGN_17_10.md` (Phase E) le dit explicitement :
aucune des trois pistes de design n'est construite, et la seule qui
répondrait visuellement à « sexy » (piste 3, rupture typographique)
va à l'encontre de l'identité actuelle. **Tant qu'aucune piste n'est
choisie, aucun message visuel ne peut s'appuyer sur un changement qui
n'existe pas encore.** Les deux pistes de canal qui suivent supposent
donc une décision de la phase E, pas une image prête.

---

## Trois pistes de message et de canal

Chacune nomme ce qu'elle suppose de la phase E, et son coût — en temps
d'écriture/visuel, pas en développement, puisqu'aucune action externe
n'est prise ici.

### Piste A — « Ce que personne d'autre ne peut prouver »

**Le message.** S'adresser directement à l'audience 2 (qui a déjà
renoncé à un tracker à cause d'un compte) avec la comparaison
factuelle de la veille concurrentielle : trois trackers de
progression, trois comptes obligatoires, un seul qui n'en demande
aucun. Pas un slogan vague (« simple », « léger ») — une affirmation
vérifiable, nommée comme telle.

**Ce qu'elle suppose de la phase E.** Rien : elle ne dépend d'aucune
piste de design, puisqu'elle vend un fait d'architecture, pas une
image. C'est la seule des trois pistes publiable sans attendre une
décision de la phase E.

**Canal.** Un texte long (billet, page « pourquoi »), pas une image —
une comparaison à trois lignes ne tient pas dans un format court sans
perdre ce qui la rend crédible (les citations exactes). `public/pourquoi.html`
existe déjà et pourrait porter ce texte sans surface nouvelle.

**Coût.** Rédaction seule, pas de visuel à produire : de l'ordre d'une
demi-journée d'écriture, en reprenant ce que `docs/VEILLE_CONCURRENTIELLE_17_10.md`
a déjà établi. Risque principal : une comparaison nommément critique de
trois produits commerciaux doit rester factuelle et sourcée (ce que la
veille fait déjà) pour ne pas devenir une attaque non étayée.

### Piste B — « Vous avez déjà marché plus que vous ne le pensez »

**Le message.** S'adresser à l'audience 1 (le randonneur régulier) par
l'émotion du chiffre plutôt que par l'architecture : une capture
d'écran du tableau de bord avec un vrai pourcentage de complétion d'un
GR connu (Compostelle, GR 20…), légendée simplement.

**Ce qu'elle suppose de la phase E.** Une image qui donnera une
première impression — donc elle profite d'une piste de design choisie
avant d'être publiée, sans en dépendre strictement : une capture de
l'interface actuelle reste honnête et montrable, simplement moins
« sexy » que si la piste 1 ou 2 de la phase E était retenue d'abord.

**Canal.** Une image, donc un réseau qui la met en avant (le type de
canal se décide, pas son nom précis ici) — c'est le format le plus
proche d'une « capture d'écran, store, réseaux sociaux » évoquée en
phase E comme le public que la piste 3 de design visait sans qu'aucun
persona documenté ne le représente.

**Coût.** Une capture et une légende : quelques heures. Risque : sans
retouche de design (phase E), l'image reste fonctionnelle plutôt que
distinctive — cohérent avec ce que la piste 1 de la phase E anticipait
déjà (« répond quasiment pas à rendre l'appli sexy »).

### Piste C — « Accessible à qui en a le plus besoin »

**Le message.** S'adresser à l'audience 3 en nommant des cas précis
plutôt qu'un adjectif creux (« accessible ») : Théo qui s'en sert à
9 ans sans aide, Jeanine à 76 ans, un contraste pensé pour un
daltonien. Des faits déjà mesurés (`AUDIT_UX.md`, `AUDIT_APPLICATIF_17_10.md`,
les tests de contraste), pas une promesse.

**Ce qu'elle suppose de la phase E.** Rien de bloquant, mais un risque
direct si la piste 3 de la phase E (rupture typo/densité) était
retenue sans garde-fou : elle dessert justement cette audience-là
(signalé en toutes lettres dans `docs/PROPOSITIONS_DESIGN_17_10.md`).
Publier ce message **après** avoir choisi une piste de design qui
dessert l'accessibilité serait une promesse qui devient fausse — le
même défaut que CLAUDE.md §4bis nomme pour un commentaire de code,
transposé à une phrase publique.

**Canal.** Texte, pas image — l'accessibilité se raconte mal en une
capture, et se raconte bien en cas concrets, comme `PERSONAS.md` le
fait déjà pour un public interne.

**Coût.** De l'ordre d'une demi-journée, en reprenant des constats déjà
écrits. Risque principal, nommé ci-dessus : rester vrai après un choix
de la phase E.

---

## Ce que ce document ne tranche pas

Quelle piste choisir, dans quel ordre, et laquelle de la phase E la
précède : ce sont des décisions de Cédric. La piste A est la seule
indépendante d'un choix de design ; B et C profitent d'un choix fait en
phase E sans en dépendre absolument pour B, et avec un risque de
contradiction pour C si ce choix va dans le mauvais sens.

Aucun texte n'a été publié, aucun visuel produit, aucun compte ouvert
pour écrire ce document.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0154ZRyRPiim5MLBEbLCNbw3
