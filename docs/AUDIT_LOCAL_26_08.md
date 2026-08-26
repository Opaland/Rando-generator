# Ce que le développement en local débloquerait — audit mesuré du 26/08

Demande de Cédric, 26/08 :

> « quelles seraient les choses que je gagnerai à passer en local […] et
> quelles sont les limitations aujourd'hui que tu ne peux pas franchir »

Ce document ne raisonne pas, il mesure. Chaque hôte a été appelé depuis cette
machine ce matin, et le code de retour est celui qui est écrit.

---

## 1. La mesure : ce qui sort d'ici, et ce qui ne sort pas

```bash
for h in …; do curl -sS -o /dev/null -w "%{http_code}" "https://$h/"; done
```

`000` = la connexion n'a pas abouti (`CONNECT tunnel failed, 403` côté proxy).

| hôte | code | ce qu'il sert |
|---|---|---|
| `registry.npmjs.org` | **200** | dépendances |
| `api.github.com` | **200** | issues, PR, CI |
| `github.com` | **400** *(joignable)* | git |
| `raw.githubusercontent.com` | **301** *(joignable)* | fichiers bruts |
| `data.geopf.fr` | 000 | **le service altimétrique de l'application** |
| `tile.openstreetmap.org` | 000 | **le fond de carte** |
| `data.grandlyon.com` | 000 | **les boucles de la Métropole** |
| `overpass-api.de` | 000 | **les itinéraires** |
| `overpass.kumi.systems` | 000 | le second miroir |
| `www.openstreetmap.org` | 000 | l'API OSM |
| `api.openstreetmap.org` | 000 | idem |
| `nominatim.openstreetmap.org` | 000 | la recherche de lieu |
| `opaland.github.io` | **000** | **la page déployée** |
| `huggingface.co` | 000 | le modèle d'IA |
| `cdn.jsdelivr.net` · `unpkg.com` | 000 | les CDN |
| `developers.strava.com` · `api.strava.com` | 000 | Strava |
| `www.data.gouv.fr` · `api-adresse.data.gouv.fr` | 000 | contours communaux, adresses |
| `geotrek-admin.parc-naturel-pilat.fr` | 000 | les ~200 circuits du Pilat |

**Trois hôtes passent. Tous les autres sont refusés.** Et les trois qui
passent servent à fabriquer le logiciel, aucun à le faire fonctionner.

### La conséquence qu'il faut regarder en face

**Je n'ai jamais vu Sentiers fonctionner.** Pas une fois. Les 354 tests e2e
tournent contre des bouchons que j'ai écrits moi-même ; le fond de carte est
un PNG transparent de 1×1 ; l'altimétrie rend `800 + i × 3`.

Tout ce que je sais du comportement réel de l'application vient de captures
d'écran et de fiches que Cédric colle dans la conversation. **C'est
exactement pour ça que les cinq défauts d'hier soir ont été trouvés par lui
et pas par moi** — #316, #317, #318, #321, #323.

---

## 2. Ce qui est bloqué aujourd'hui, issue par issue

### Bloqué par l'absence d'Overpass / OSM

| issue | ce qui manque | ce que ça coûte |
|---|---|---|
| **#301** | lire la relation `6628093` | « Rando Saint-Joseph » annoncée à 500 m — trois hypothèses, aucune tranchée |
| **#321** | compter relations et chemins balisés autour de Porcelette | trois PR du village invisibles, cause inconnue |
| **#290** volet 2 | la part des relations portant un `osmc:symbol` exploitable | la carte contredit la fiche, et on ne peut pas décider sans risquer une carte à deux régimes |
| **#322** | la part des itinéraires portant un `network` exploitable | « qu'est-ce qu'un GR pour le code » reste indécidable |
| **#285** moitié 2 | la couverture des catégories de village | `npm run couverture-village` est **écrit et attend un réseau** |
| **#20** | inventorier les PR du Rhône dans OSM | l'issue la plus ancienne du dépôt, ouverte depuis le 19/08 |

### Bloqué par l'absence des API tierces

| issue | hôte refusé |
|---|---|
| **#87** PDIPR départementaux | `www.data.gouv.fr` |
| **#88** Geotrek Pilat (~200 circuits) | `geotrek-admin.parc-naturel-pilat.fr` |
| **#296** piste 3, contours communaux | `www.data.gouv.fr` |
| **#329** Strava | `developers.strava.com` — **l'analyse actuelle repose sur des sources secondaires**, et le dit |
| **#327** IA pierre 1, poids du modèle | `huggingface.co`, `cdn.jsdelivr.net` |

### Bloqué par l'absence de la page déployée

**La revue globale que Cédric a demandée trois fois est impossible d'ici.**
`opaland.github.io` est refusé : je ne peux ni charger la page livrée, ni
lancer Playwright contre elle, ni vérifier ce que seul le déploiement révèle —
le chemin de base, le service worker, le précache, les en-têtes.

C'est le point le plus net de cet audit, et j'aurais dû le mesurer la première
fois qu'il l'a demandé au lieu de répondre « je le ferai après ».

### Un seuil qui mérite d'être revu quand le réseau existera

`PAS_MINIMAL_METRES = 5` (issue #316) est présenté comme « le pas du MNT
qu'annonce la Géoplateforme ». **Je n'ai pas pu lire cette annonce** :
`geoservices.ign.fr` et `data.geopf.fr` sont refusés. Le nombre vient de ma
propre issue, écrite de mémoire.

Ce n'est pas un seuil inventé au sens du §2 — il a une source réelle — mais sa
provenance n'a pas été **vérifiée**, et le §4bis dit qu'une justification est
une affirmation. À confirmer sur la documentation officielle le jour où elle
sera lisible.

---

## 3. Ce que le local ne débloque pas

Autant le dire tout de suite, pour que la décision se prenne sur le vrai
périmètre.

| ce qui reste bloqué | pourquoi |
|---|---|
| **#152** — la mesure de batterie | il faut un téléphone **et quelqu'un qui marche**. Le remote control ne marche pas. |
| **#327** — le temps de plongement sur un téléphone de cinq ans | même chose : un appareil réel, sous une vraie charge |
| **#171** — cinq sessions utilisateur | il faut cinq personnes |
| **#2** — la balise blanc/rouge | question juridique |
| **#162** — renommer le dépôt | réglages GitHub de Cédric |
| **#14** — audit mobile réel | « réel » veut dire un téléphone, pas un émulateur |

Le corpus de traces, lui, **n'est plus un blocage** : Cédric l'a fourni le
25/08, et il a servi le jour même (`docs/MESURE_VITESSE_25_08.md`).

---

## 4. L'option qu'il faut examiner avant le local

Le README du proxy est explicite :

> The destination host is not allowed by **your organization's egress policy
> for this session**.

Et la documentation de l'environnement d'exécution distant dit que la
politique réseau est **choisie à la création de l'environnement**.

**Autrement dit : élargir la liste des hôtes autorisés réglerait la quasi-
totalité de ce document, sans rien changer d'autre.** Onze hôtes suffiraient :

```
overpass-api.de              data.geopf.fr
overpass.kumi.systems        tile.openstreetmap.org
www.openstreetmap.org        data.grandlyon.com
nominatim.openstreetmap.org  opaland.github.io
www.data.gouv.fr             geotrek-admin.parc-naturel-pilat.fr
huggingface.co
```

C'est à vérifier dans les réglages de l'environnement — je ne peux pas le
faire d'ici, et je ne sais pas si la politique est modifiable dans ce contexte.
Mais **c'est la première chose à regarder**, parce que c'est de loin la moins
chère.

---

## 5. Ce que le local apporte réellement, si la politique n'est pas modifiable

### Ce qu'on gagne

1. **Voir l'application marcher.** Le gain principal, et il ne se chiffre pas
   en issues débloquées : il change la nature du travail. Les cinq défauts
   d'hier soir sont sortis d'une lecture d'écran par un humain. Une sonde qui
   ne voit jamais l'application réelle ne trouve que ce qu'on lui a appris à
   chercher (§6quinquies).
2. **Les six mesures Overpass** ci-dessus, qui débloquent six issues d'un coup.
3. **La revue globale sur la page déployée**, avec les e2e contre l'URL réelle.
4. **Le poids réel du modèle d'IA**, donc la moitié de #327.
5. **Une porte plus rapide.** Ici : 4 cœurs, 16 Go. La porte complète prend
   **~17 minutes** (13,6 e2e + 1,7 monkey + ~2 le reste). Une machine à
   8 ou 12 cœurs la ramènerait sous les dix.

### Ce que ça coûte

1. **Le remote control** pour parler au téléphone — Cédric l'a déjà anticipé.
2. **Sa machine doit rester allumée** pour les sessions de nuit. Aujourd'hui
   le conteneur tourne sans lui.
3. **Le bac à sable disparaît.** Ici, une commande destructrice ne casse qu'un
   conteneur jetable. En local, elle casse sa machine. La discipline des hooks
   devient une protection, plus une commodité.
4. **Les secrets changent de nature.** Un jeton Strava sur sa machine est un
   jeton sur sa machine.

---

## 6. Ce que je recommande

**Dans cet ordre, et le premier suffit peut-être :**

1. **Regarder si la politique réseau de l'environnement est modifiable**, et y
   ajouter les onze hôtes. Coût : quelques minutes. Gain : tout le §2.
2. **Si elle ne l'est pas — passer en local**, pour les mêmes onze hôtes plus
   la page déployée.
3. **Dans les deux cas**, garder la discipline des bouchons : les e2e doivent
   continuer à tourner **sans réseau**. Un test qui dépend d'Overpass est un
   test qui rougira le jour où Overpass sera lent. Le réseau sert à **mesurer**
   et à **vérifier**, pas à faire tourner la suite.

Ce troisième point n'est pas une précaution de style : c'est ce qui a permis
aux 354 tests de tourner en 13 minutes cette nuit pendant qu'Overpass était
inaccessible.
