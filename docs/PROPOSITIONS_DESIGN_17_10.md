# Propositions de direction visuelle — 17/10/2026

Phase E du plan agentique (`docs/PLAN_AGENTIQUE_16_10.md`), second volet :
« ce qui se décide » (§6sexies). La partie « ce qui se mesure » est close —
`docs/AUDIT_APPLICATIF_17_10.md` (46/46 passés) et les tests unitaires
`couleursDeReseau.test.ts`/`terrainCouleurs.test.ts` la couvrent déjà en
continu. Ce document ne refait ni l'un ni l'autre.

Demande d'origine de Cédric (16/10) : « review UI/UX et correction et
changement de design system. […] L'a rendre sexy. » Ce qui suit répond à la
partie « changement de design system » — des pistes, pas une décision ni une
construction. **Aucun fichier `src/` ni CSS n'a été touché pour écrire ce
document.**

---

## Avant de proposer : ce que l'identité actuelle protège

`docs/DESIGN_SYSTEM.md` (issue #176) et `FEUILLE_DE_ROUTE.md` → « Ce qu'on ne
fera pas » sont explicites : papier crème, pas de bibliothèque de
composants, minimalisme volontaire. Ce n'est pas un défaut d'investissement,
c'est un choix daté et justifié — relire les deux avant de juger que
l'identité « manque de travail ».

Ce que cette sobriété fait pour l'application, concrètement, et qui n'est
pas négociable sans le dire explicitement :

- **le poids livré.** Aucune police distante, aucune dépendance visuelle —
  cohérent avec « les requêtes de polices ne quittent pas le navigateur non
  plus » (même promesse que les données). Une bibliothèque de composants
  (Material, shadcn, etc.) ajoute du JavaScript et souvent des polices
  distantes ;
- **la lisibilité dehors** (`--texte-etiquette`, `--texte-appui`,
  `--texte-secondaire`, contraste tenu par `couleursDeReseau.test.ts`) —
  l'application se lit en marchant, en plein soleil, pas seulement à vingt
  centimètres dans un salon ;
- **la distinction du vocabulaire de couleur.** Chaque teinte est nommée par
  l'usage (`--rouge-balisage`, pas `--rouge-vif`) et le balisage réel
  (GR/GRP/PR/réseaux) a priorité sur toute palette de marque — c'est
  Anne-Marie (Club Vosgien, `PERSONAS.md`) qui tranche ici : peindre un
  sentier autrement que son balisage réel est une erreur, pas une liberté
  graphique ;
- **le choix assumé de ne pas gamifier** (étoiles = « ça a compté », jamais
  un classement) — `CONCURRENTS_27_08.md` documente que c'est précisément ce
  qui distingue Sentiers de Wandrer, et `FEUILLE_DE_ROUTE.md` l'interdit
  explicitement (« pas de score, pas de classement, pas de comparaison »).

Les trois pistes qui suivent sont écrites **à l'intérieur** de ces
contraintes, sauf la troisième qui les teste explicitement et le dit.

### Un avertissement de méthode, avant les pistes

Tout ce qui suit mélange nécessairement de la mesure et du jugement. Ce qui
est chiffré (contraste, ΔE, poids en ko, lignes de CSS) est mesuré ou
mesurable ; ce qui touche à l'élégance, au « sexy », à la modernité perçue
est **une opinion de l'auteur de ce document**, pas un résultat d'audit.
Le §2 de `CLAUDE.md` interdit de présenter l'un comme l'autre — chaque
piste le signale à l'endroit où le jugement intervient.

---

## Piste 1 — Affiner sans rien remplacer (« papier retravaillé »)

**L'idée.** Garder exactement la structure actuelle — mêmes tokens, mêmes
noms, même absence de bibliothèque — et ne retoucher que trois leviers déjà
prévus par le système lui-même : l'échelle d'espacement (dont le pas de
2 px est documenté comme contrainte, pas comme choix esthétique), les
rayons (`--rayon-sm/md/lg`), et le poids des `--ombre-*`. Concrètement :
resserrer légèrement les paliers d'espacement en haut de l'échelle (le
texte dit que 8 à 16 ont été ajoutés après les 16 valeurs historiques — un
nouveau passage y retrouverait de la cohérence), harmoniser les trois
ombres sur une seule direction de lumière, et affiner le contraste entre
`--gris-vert` et `--gris-vert-clair` pour une hiérarchie de lecture un peu
plus nette entre titre, corps et texte d'appui.

**Ce qu'elle garde.** Tout : palette, typographie système, absence de
bibliothèque, noms d'usage, le papier crème lui-même. Aucun token n'est
renommé, aucune valeur de couleur de balisage ne change.

**Ce qu'elle change.** Des nuances d'espacement et d'ombre, pas une
identité. *(Jugement de l'auteur, non mesurable : l'effet perçu serait
proche de « la même application, mais polie » — un ΔE ou un contraste ne
peuvent pas dire si une mise en page paraît plus soignée.)*

**Ce qu'elle coûte.**
- Temps de dev : **petit**, ordre de grandeur 1 à 3 jours — ce sont des
  changements de valeurs de tokens existants, pas de nouvelle architecture
  CSS. La majorité du temps irait à repasser les captures de l'audit UI
  (`audit-ui`) pour vérifier qu'aucun des 46 cas ne régresse.
- Risque sur les tests de contraste/ΔE existants : **très faible**.
  `couleursDeReseau.test.ts` et `terrainCouleurs.test.ts` ne testent ni
  l'espacement ni les ombres ; seule une retouche de `--gris-vert-clair`
  toucherait potentiellement le contraste testé, et resterait dans la même
  famille de teinte, pas un changement de hue.

**À qui elle s'adresse.** Sert le mieux **Jeanine et Théo** : rien de
nouveau à apprendre, aucun repère déplacé, et un contraste de hiérarchie
plus net aide justement la lecture au gros texte. Elle **ne répond
quasiment pas** à la demande « rendre l'appli sexy » : c'est son principal
défaut vis-à-vis de la demande d'origine — un public qui cherche une
différence visible immédiate (capture d'écran, store, réseaux sociaux) ne
verra presque rien changer.

**Contre `FEUILLE_DE_ROUTE.md` « Ce qu'on ne fera pas ».** Aucun heurt :
pas de bibliothèque, pas de compte, pas de score, pas de navigation
touchée.

---

## Piste 2 — Une seconde peau saisonnière/terrain, au choix de la personne

**L'idée.** Garder le système de tokens actuel comme **moteur**, mais
permettre de choisir, en plus du suivi `prefers-color-scheme` déjà en place
(clair/sombre), une variante de palette liée au terrain plutôt qu'à la
marque : par exemple une variante « sentier » (verts et ocres plus soutenus,
pensée montagne/forêt) à côté de la variante « papier » actuelle. Chaque
variante resterait un jeu de valeurs pour les **mêmes tokens nommés par
l'usage** (`--rouge-balisage` reste le rouge GR dans les deux cas) — la
structure ne change pas, seules les valeurs de fond/texte/accent
changeraient.

**Ce qu'elle garde.** La nomenclature par usage, l'absence de bibliothèque
de composants, le fonctionnement local (pas de compte pour mémoriser le
choix — juste un réglage local, comme le suivi système de thème), et le
fait que le balisage réel (GR/GRP/PR) reste inchangé dans toutes les
variantes — condition non négociable pour Anne-Marie.

**Ce qu'elle change.** L'introduction d'un second (ou troisième) jeu de
couleurs de surface/texte, sélectionné par la personne plutôt que déduit du
système. C'est une **nouvelle surface de réglage** dans « Réglages »
(onglet déjà existant), pas une nouvelle dépendance.

**Ce qu'elle coûte.**
- Temps de dev : **moyen**, ordre de grandeur 1 à 2 semaines. Il faut
  dupliquer et faire tenir un second bloc de variables sous un sélecteur
  d'attribut (même mécanique que `prefers-color-scheme` aujourd'hui, mais
  un second axe orthogonal au lieu d'un `@media`), repasser **chaque**
  contraste et ΔE de la nouvelle variante, et vérifier les quatre
  combinaisons (clair/sombre × papier/sentier) plutôt que les deux
  actuelles.
- Risque sur les tests de contraste/ΔE existants : **réel et nommé**. Ce
  n'est pas un risque de régression sur la variante existante (elle ne
  change pas), mais `couleursDeReseau.test.ts` et `terrainCouleurs.test.ts`
  devraient être **étendus** pour couvrir la nouvelle variante — sans quoi
  elle serait un angle mort, exactement la famille de défaut que
  `CLAUDE.md` §6quinquies documente (« ce qui est replié par défaut est ce
  qu'une sonde oublie par défaut », appliqué ici à « ce qui n'est pas la
  variante par défaut »). Ce travail de test est à inclure dans l'estimation
  ci-dessus, pas en supplément.

**À qui elle s'adresse.** Sert **Camille et Bernard** (qui utilisent
l'application sur de longues durées, à qui une variante plus « terrain »
pourrait parler) sans rien retirer à Théo/Jeanine, qui garderaient la
variante par défaut inchangée. *(Jugement : rien ne prouve qu'une variante
« terrain » serait perçue comme plus sexy — c'est une hypothèse de
positionnement, pas une mesure.)* Elle dessert un peu Sylvie, qui découvre
l'application : un réglage de plus à comprendre avant même d'avoir compris
GR/PR est une charge cognitive supplémentaire au pire moment.

**Contre `FEUILLE_DE_ROUTE.md` « Ce qu'on ne fera pas ».** Aucun heurt
direct. Point de vigilance : elle doit rester un réglage d'affichage pur,
jamais un compte pour la mémoriser entre appareils — sinon elle recoupe
« pas de compte, pas de serveur ».

---

## Piste 3 — Rupture typographique et densité, en citant explicitement le heurt

**L'idée.** La piste la plus proche de ce qu'un regard extérieur
qualifierait de « sexy » : introduire une police d'affichage distinctive
pour les titres (actuellement un empilement de polices système :
`"Avenir Next", "Futura", "Trebuchet MS", "Segoe UI", system-ui`, donc
visuellement différent d'un appareil à l'autre), resserrer la densité
d'information sur les écrans à fort contenu (fiche détail, tableau de bord)
avec une hiérarchie typographique plus marquée, et introduire deux ou trois
accents de couleur de marque (au-delà des couleurs de balisage, qui ne
changent pas) pour les éléments d'interface neutres aujourd'hui en
gris-vert.

**Ce qu'elle garde.** Les couleurs de balisage et leurs tests, le
vocabulaire par usage, et — si on choisit l'option « service de police
auto-hébergée » plutôt que distante — la promesse réseau.

**Ce qu'elle change, et où elle heurte frontalement l'existant.**

1. **Une police distante ou embarquée** irait à l'encontre du choix
   documenté explicitement (« aucune police distante — ce qui est cohérent
   avec la promesse : les requêtes de polices ne quittent pas le navigateur
   non plus »). Une police embarquée dans le paquet (plutôt que chargée
   depuis un CDN) ne romprait pas la promesse réseau, mais romprait le
   choix « aucune dépendance visuelle » et ajouterait du poids au
   téléchargement initial — un coût réel sur un public qui recharge parfois
   sur un réseau de montagne faible (Camille, Marc).
2. **Des accents de marque supplémentaires** risquent de recréer exactement
   le problème que `DESIGN_SYSTEM.md` documente comme déjà résolu une fois
   (deux jaunes à un chiffre hexadécimal d'écart) : plus une palette porte
   de teintes « libres », plus elle est difficile à garder sous ΔE 20 entre
   familles. Chaque nouvel accent devrait être ajouté aux tests ΔE
   existants dans le même commit (`DESIGN_SYSTEM.md`, section couleurs des
   POI, le dit déjà pour ce cas précis).
3. **Augmenter la densité d'information** va à l'encontre de U11 (émojis
   en couleur jugés hors palette, laissé ouvert comme choix de design) et
   plus largement de l'esprit « minimalisme volontaire » que
   `DESIGN_SYSTEM.md` revendique — ce n'est pas une règle écrite dans « Ce
   qu'on ne fera pas », mais c'est une tension directe avec l'identité
   actuelle, à trancher consciemment plutôt qu'à glisser en douce.

**Ce qu'elle coûte.**
- Temps de dev : **le plus élevé des trois**, ordre de grandeur 3 à 6
  semaines. Une police d'affichage touche potentiellement toutes les
  surfaces où `--font-display` est utilisé (titres, boutons), la densité
  d'information touche la mise en page de chaque écran mesuré par
  `regles-d-ecran.spec.ts` (donc tout l'audit à rejouer), et de nouveaux
  accents de couleur demandent un nouveau tour de la méthode ΔE/contraste
  pour chaque paire.
- Risque sur les tests de contraste/ΔE existants : **élevé, et le plus
  élevé des trois pistes**. Toute nouvelle teinte d'accent doit repasser
  par `couleursDeReseau.test.ts`/`terrainCouleurs.test.ts` ou leurs
  équivalents, et une police différente change la largeur réelle du texte
  — avec un risque direct sur les cibles tactiles et les débordements que
  `AUDIT_APPLICATIF_17_10.md` vient de confirmer propres (46/46) : une
  nouvelle police aux métriques différentes peut rouvrir exactement ce que
  l'audit ferme aujourd'hui, en particulier le constat 2 de cet audit
  (attribution déjà réduite à une lettre à 390 px) qui serait aggravé par
  une police plus large.

**À qui elle s'adresse.** C'est la seule des trois pistes qui répond
directement à « l'a rendre sexy » au sens où Cédric l'a formulé — un
changement visible, différenciant, montrable en capture d'écran.
*(Jugement pur de l'auteur : aucune mesure ne dit qu'une police
d'affichage distincte « vend » mieux l'application — c'est une hypothèse
de marketing, pas un résultat.)* Elle sert le mieux un public qui découvre
l'application par une image (réseaux sociaux, store, bouche-à-oreille
visuel) — aucun persona documenté ne représente explicitement ce profil,
ce qui est en soi une observation : les personas de `PERSONAS.md` sont
tous écrits du point de vue de quelqu'un qui *utilise déjà* l'application,
pas de quelqu'un qui décide de l'essayer sur une image. Elle **dessert**
Théo et Jeanine le plus directement des trois pistes : une police
d'affichage « distinctive » est presque toujours moins neutre en lisibilité
qu'un empilement de polices système déjà optimisées par chaque plateforme,
et une densité accrue va frontalement contre le besoin de gros texte lisible
de loin.

**Contre `FEUILLE_DE_ROUTE.md` « Ce qu'on ne fera pas ».** Pas de heurt sur
le point littéral (« pas de bibliothèque de composants ») si la police
reste un fichier embarqué sans framework UI autour. Mais c'est la piste la
plus proche de l'esprit de la section « Ce qu'on ne fera pas » sans la
heurter au mot : le document dit « il n'y a rien à réécrire — tout est
déjà tokenisé », et cette piste proposerait justement de réécrire une
partie de ce qui est tokenisé plutôt que de l'affiner. **À dire
explicitement plutôt qu'à masquer** : si Cédric retient cette piste, c'est
un choix d'aller plus loin que ce que `DESIGN_SYSTEM.md` et
`FEUILLE_DE_ROUTE.md` anticipaient, pas une mise en œuvre tranquille d'une
intention déjà écrite.

---

## Tableau récapitulatif

| Piste | Coût dev (ordre de grandeur) | Risque tests ΔE/contraste | Sert le mieux | Dessert le plus | Heurte « Ce qu'on ne fera pas » |
|---|---|---|---|---|---|
| 1. Papier retravaillé | 1-3 jours | très faible | Jeanine, Théo | — | non |
| 2. Seconde peau terrain | 1-2 semaines | réel, mais maîtrisable (tests à étendre) | Camille, Bernard | un peu Sylvie (charge cognitive à l'accueil) | non, si réglage local pur |
| 3. Rupture typo/densité | 3-6 semaines | élevé | public « découverte visuelle », non représenté dans les personas | Théo, Jeanine | pas littéralement, mais va à l'encontre de l'esprit du document |

---

## Ce que ce document ne tranche pas

Les trois pistes peuvent se combiner partiellement (par exemple la piste 1
en fondation, la piste 2 en option) : ce document ne recommande pas une
combinaison plutôt qu'une autre, c'est une décision de Cédric. Il ne dit
pas non plus laquelle est « la plus sexy » au sens absolu — cette question
n'a pas de réponse mesurable, seulement des hypothèses nommées comme
telles ci-dessus.

Aucune des trois pistes n'a été construite, codée ni testée ici : c'est un
document de décision, pas un sprint. La phase F (positionnement marketing)
du plan agentique suppose un choix fait ici avant d'écrire comment
présenter l'application — ce choix reste ouvert.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0154ZRyRPiim5MLBEbLCNbw3
