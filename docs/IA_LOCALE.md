# Une IA dans Sentiers, sans serveur

Demande de Cédric, 24/08 :

> « j'aimerais également que tu réfléchisses à mettre en place une
> intelligence artificielle dans l'application. pour cela, tu peux utiliser
> plusieurs modèles l'intérêt d'utiliser des modèles gratuit, même pas
> performant mais qui donnerait des résultats probants. par rapport à
> l'application, il faudrait pour cela par contre mettre en place un système
> de rag complet »

Et, quelques minutes plus tard :

> « regarde s'il existe par exemple une IA spécialisée en randonnée »

Cette note répond aux deux, et elle dit surtout **ce qui est mesuré et ce
qui ne l'est pas**. Rien n'est livré sur la foi de cette page : elle sert à
décider, pas à promettre.

---

## 1. Oui, l'IA de randonnée existe — et c'est exactement ce que Sentiers ne
   peut pas être

| Produit | Ce qu'il fait | Où ça tourne |
|---|---|---|
| **TrailGPT** (HiiKER) | questions libres sur 100 000 sentiers, recommandations selon l'historique | serveur |
| **AllTrails Peak** | reroutage « plus court / moins raide / plus beau », 500 000 sentiers | serveur |
| **Komoot**, **Outdooractive** | suggestions personnalisées d'itinéraires | serveur |

Toutes envoient votre historique de randonnée à un tiers. C'est le modèle
économique, pas un défaut d'ingénierie.

Or l'en-tête de Sentiers dit, sur chaque écran :

> « Vos traces GPX ne quittent jamais votre navigateur — aucun compte, aucun
> serveur, aucune télémétrie. »

**Il n'y a donc pas de version « on appelle une API » de cette
fonctionnalité.** Ce n'est pas une préférence : c'est la seule promesse que
l'application fasse, elle est écrite en haut de l'écran, et la trahir une
fois suffirait à la rendre fausse pour toujours. Toute IA dans Sentiers
tourne sur l'appareil, ou n'existe pas.

Ce qui est un handicap est aussi le seul angle : **une IA de randonnée qui
ne sait rien de vous ailleurs que chez vous n'existe pas encore.**

---

## 2. Ce qui tient dans un navigateur, en chiffres

Trois briques, trois ordres de grandeur — et c'est le troisième qui tranche.

| Brique | Rôle | Poids | Verdict |
|---|---|---|---|
| **all-MiniLM-L6-v2** (ONNX quantifié, `transformers.js`) | plonger un texte en 384 dimensions | **≈ 23 Mo** | tenable, à la demande |
| **EmbeddingGemma** (308 M paramètres) | idem, meilleure qualité, 2 K de contexte | ≈ 200 Mo | trop lourd pour un premier pas |
| **Phi-3-mini INT4** (WebLLM, WebGPU) | *générer* du texte | **≈ 2,1 Go** | hors de portée |

Deux mises en garde sur ces nombres, parce qu'ils circulent mal :

- le dépôt `Xenova/all-MiniLM-L6-v2` pèse **344 Mo** au total ; c'est le
  fichier `model_quantized.onnx` qui fait 23 Mo. Une installation naïve
  téléchargerait quinze fois ce qu'il faut ;
- WebGPU, indispensable à la génération, **manque encore sur beaucoup de
  téléphones**. Une fonctionnalité qui ne marche que sur un téléphone récent
  n'est pas une fonctionnalité de randonnée : le téléphone de montagne est
  souvent le vieux, celui qu'on n'a pas peur de casser.

**Conclusion : la génération est écartée.** Pas « reportée en attendant
mieux » — écartée tant que 2,1 Go séparent l'idée de sa réalisation. Ce qui
reste, la recherche sémantique, coûte cent fois moins et répond déjà à la
plupart des questions qu'on pose à une carte.

---

## 3. Ce qu'un RAG local peut réellement faire ici

Un RAG a besoin d'un corpus. Celui de Sentiers est petit, et c'est une bonne
nouvelle : la recherche par force brute suffit jusqu'à quelques centaines de
documents, ce qui évite un index HNSW et les 100 Ko de WebAssembly qui vont
avec.

Ce que l'application a déjà sous la main, sans rien télécharger de plus :

- **les itinéraires de la zone** — nom, réseau, longueur, dénivelé, durée
  estimée, revêtement par famille, boucle ou aller simple ;
- **les points d'intérêt** — refuges, gîtes d'étape, points d'eau, cols,
  avec leurs informations pratiques ;
- **les sorties enregistrées** — dates, distances, progression par
  itinéraire, ce qui a été déclaré parcouru ;
- **les étapes calculées** et leurs couchages.

Les questions que cela permet, et qui n'ont aujourd'hui **aucune** réponse
dans l'application :

> « une boucle de trois heures pas trop raide, avec de l'eau »
> « où dormir entre le kilomètre 40 et le kilomètre 60 »
> « qu'est-ce qui me reste à faire près de chez moi »
> « un sentier à l'ombre pour un jour de canicule »

Aujourd'hui, chacune demande de traduire soi-même la question en filtres —
distance, dénivelé, cases à cocher. C'est exactement ce que « Trouver une
sortie » propose, et exactement ce que personne ne fait.

---

## 4. L'architecture, en trois pierres

### Pierre 1 — la recherche sémantique, sans génération

```
  question (texte libre)
        │
        ├─ plongement local (MiniLM ONNX, WebWorker)
        │
        ▼
  similarité cosinus, force brute, sur l'index
        │
        ▼
  les cinq itinéraires les plus proches, expliqués
```

Points d'attention, tous déjà rencontrés dans ce dépôt :

- **le modèle se télécharge à la demande**, exactement comme « Emporter cette
  randonnée » : un bouton, un poids annoncé, un cache de service worker, et
  ça marche hors ligne ensuite. Le vocabulaire existe déjà, il n'y a rien à
  inventer ;
- **le plongement tourne dans un `WebWorker`**. Le fil principal peint une
  carte ; le bloquer trois secondes pour une recherche est un défaut avant
  d'être une lenteur ;
- **l'index vit dans IndexedDB**, à côté des POI emportés et des
  déclarations. La base est déjà versionnée (`DB_VERSION = 5`) ;
- **les vecteurs se recalculent quand la zone change.** Un index périmé
  répondrait sur des itinéraires absents de la carte — le même défaut que
  les POI périmés, que le service worker refuse déjà de servir.

### Pierre 2 — l'explication

Une réponse sans justification ne vaut rien ici : « ce GR est proche de votre
question » n'aide personne. La réponse doit dire **pourquoi** — « 2 h 40,
D+ 180 m, deux points d'eau, boucle » — et ces phrases se composent à partir
des champs, sans modèle de langage.

C'est le point où un RAG sans génération est *meilleur* qu'un RAG avec :
il ne peut pas inventer un point d'eau.

### Pierre 3 — la génération, si et seulement si

Elle n'a de sens que le jour où un modèle utile tient dans quelques dizaines
de mégaoctets, ou bien sur les seuls appareils qui le permettent, **avec le
reste de l'application intact sans lui**. Aucune fonctionnalité de Sentiers
ne doit dépendre d'un modèle : c'est une application qu'on emmène là où il
n'y a pas de réseau.

---

## 5. Ce qui manque pour décider — et qui ne s'invente pas

Cette note ne conclut pas, parce que trois chiffres manquent et qu'aucun ne
se devine (CLAUDE.md §2) :

1. **Le temps de plongement sur un téléphone de cinq ans.** Vingt itinéraires
   à plonger, c'est vingt passes de MiniLM. Trois secondes est acceptable,
   trente ne l'est pas, et rien ne permet aujourd'hui de dire lequel des deux
   c'est. À mesurer : un `performance.now()` autour d'un lot de vingt, sur
   l'appareil B du protocole de batterie.
2. **Le poids réellement téléchargé.** 23 Mo est la taille du fichier ONNX
   quantifié ; s'y ajoutent le tokeniseur, `onnxruntime-web` et son WASM.
   À mesurer : un build de démonstration, et l'onglet réseau.
3. **La qualité sur ce corpus-là.** MiniLM est entraîné sur de l'anglais
   général. « Une boucle pas trop raide avec de l'eau » en français, contre
   des descriptions d'itinéraires factuelles, peut très bien rendre n'importe
   quoi. À mesurer : vingt questions écrites d'avance, les réponses jugées à
   la main, et le chiffre affiché — y compris s'il est mauvais.

**Tant que ces trois nombres n'existent pas, rien n'est livré.** Une IA qui
répond mal à une question de randonnée est pire que pas d'IA du tout : sur
un sentier, on suit ce que l'écran dit.

---

## 6. Ce qui est déjà décidé

- **Aucun appel réseau vers un service d'IA.** Jamais, quelle que soit la
  qualité du modèle. C'est la promesse de l'en-tête.
- **Aucune fonctionnalité existante ne dépendra du modèle.** Il s'ajoute, il
  ne remplace rien.
- **Le poids s'annonce avant le téléchargement**, en mégaoctets mesurés — la
  règle du bouton « Emporter », et la même raison.
- **La génération est écartée** tant que le rapport entre ce qu'elle coûte
  (2,1 Go) et ce qu'elle apporte n'a pas changé d'un ordre de grandeur.
