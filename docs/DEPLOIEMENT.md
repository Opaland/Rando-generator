# Mettre Sentiers sur un serveur

Demande de Cédric, 24/08 : « on va mettre l'application sur un serveur ».

Ce document livre de quoi le faire, et dit **ce que le serveur change — et
ce qu'il ne doit pas changer**.

---

## 1. Ce qui ne change pas, et qui décide de tout le reste

L'en-tête de chaque écran dit :

> « Vos traces GPX ne quittent jamais votre navigateur — aucun compte, aucun
> serveur, aucune télémétrie. »

Cette phrase reste vraie sur un serveur, à une condition : que le serveur ne
fasse que **servir des fichiers**. Il n'y a ni base de données, ni compte, ni
API, ni journal d'usage. Un visiteur télécharge une application ; ensuite,
elle tourne chez lui.

Le mot « serveur » de la promesse ne veut pas dire « aucune machine ne sert
la page » — GitHub Pages est déjà une machine. Il veut dire **aucun serveur
ne voit vos traces**. C'est cela qu'il faut garder, et c'est ce que la
configuration livrée ici protège.

Le jour où un composant côté serveur traiterait la moindre donnée de
randonnée, cette phrase deviendrait fausse, et il faudrait la changer avant
d'écrire la première ligne. Ce n'est pas un interdit : c'est un ordre
d'opérations.

---

## 2. Ce que le serveur apporte — et que GitHub Pages ne permettait pas

**Les en-têtes.** Pages n'en laisse poser aucun. La promesse était donc une
affirmation, gardée par des tests et par la bonne volonté. Avec nginx, elle
devient une règle appliquée par le navigateur :

```
connect-src 'self' https://data.geopf.fr https://overpass-api.de
            https://overpass.kumi.systems https://api-adresse.data.gouv.fr
```

Une requête vers un autre hôte est **refusée avant de partir**. Si une
dépendance ajoutait demain un appel de télémétrie, il échouerait — sans que
personne ait à le remarquer.

C'est le gain principal du déménagement, et il va dans le sens du produit
plutôt qu'à son encontre.

Les autres gains, réels mais secondaires : un nom de domaine à soi, la
maîtrise du cache (le service worker ne doit **jamais** être mis en cache
longtemps, sous peine de figer l'application), la compression, et des
journaux qu'on peut couper.

---

## 3. Démarrer

```sh
docker compose up -d --build
curl -sI http://127.0.0.1:8080/sante   # -> 200
```

L'image se construit en deux étapes : Node compile (`tsc -b` puis
`vite build`), nginx sert. L'image finale ne contient ni Node, ni les
sources, ni les dépendances de développement — ce qui n'y est pas ne peut
pas être exploité.

Le conteneur tourne **sans root**, en système de fichiers **lecture seule**,
sans aucune capacité Linux, et n'écoute que sur la boucle locale. C'est le
proxy inverse qui expose au monde.

### Derrière Caddy

```caddyfile
sentiers.exemple.fr {
    reverse_proxy 127.0.0.1:8080
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        # Ne pas réécrire la politique de sécurité : nginx la pose déjà, et
        # deux sources pour la même règle finissent par diverger.
        -Server
    }
}
```

### Derrière Traefik

Ajouter au service dans `compose.yml` :

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.sentiers.rule=Host(`sentiers.exemple.fr`)
  - traefik.http.routers.sentiers.tls.certresolver=letsencrypt
  - traefik.http.services.sentiers.loadbalancer.server.port=8080
```

Et retirer la section `ports:` : Traefik atteint le conteneur par le réseau
Docker, et publier le port en plus laisserait une seconde entrée en clair.

---

## 4. Ce qu'il faut vérifier après le premier déploiement

Dans l'ordre, parce que chacun échoue d'une façon qui ne se voit pas tout de
suite :

1. **La politique est bien servie.**
   `curl -sI https://sentiers.exemple.fr | grep -i content-security`
   Un proxy inverse mal réglé les avale silencieusement — la page marche, la
   protection n'existe plus.

2. **Le service worker n'est pas mis en cache.**
   `curl -sI https://sentiers.exemple.fr/sw.js | grep -i cache-control`
   Attendu : `no-cache`. **C'est le piège du déploiement d'une application
   hors ligne** : un `sw.js` caché une journée fige l'application entière
   pour cette journée, correctif urgent compris. Le navigateur ne va pas
   chercher un nouveau service worker tant qu'il croit avoir l'ancien.

3. **La carte s'affiche.** Si la politique était trop stricte, elle ne
   s'affiche pas du tout — MapLibre crée ses ouvriers depuis un blob. C'est
   le symptôme le plus franc, et le plus facile à confondre avec une panne
   réseau.

4. **Le compteur de sorties ne dénonce pas l'origine.** Ouvrir « Réglages →
   ce qui sort de votre appareil ». Les fichiers du site doivent y compter
   comme « site », pas comme « destination inconnue ».
   Ce défaut a existé : `classerSortie` comparait l'hôte à
   `opaland.github.io` écrit en dur, et l'application aurait dénoncé ses
   propres fichiers dès qu'elle serait servie d'ailleurs. Corrigé le 24/08,
   gardé par un test — mais c'est exactement le genre de chose qu'un
   déménagement révèle.

5. **Les images de prévisualisation.** `og:image` doit pointer vers la
   nouvelle origine, sinon un lien partagé affiche l'image de l'ancienne.
   Voir la section suivante.

---

## 5. Ce qui reste attaché à l'ancienne adresse

Trois endroits portent encore `opaland.github.io` :

| Fichier | Ce que c'est | Effet si on ne change rien |
|---|---|---|
| `index.html` | `og:image` | un lien partagé montre l'image de l'ancien site |
| `public/pourquoi.html` | `og:image` | idem |
| `README.md` | l'adresse annoncée | la documentation envoie ailleurs |

Ce ne sont pas des bogues tant que l'ancien site répond ; ce sont des dettes
au moment où il cesse. **Une adresse absolue est obligatoire pour `og:image`**
— les réseaux sociaux ne résolvent pas les chemins relatifs — donc elle ne
peut pas être rendue relative. Elle doit être posée au build.

Ce qu'il faudrait : une variable d'environnement `VITE_ORIGINE_PUBLIQUE`, lue
par un greffon Vite qui réécrit ces deux balises. Ce n'est **pas** fait dans
ce lot, parce que rien ne permet aujourd'hui de savoir quelle sera l'adresse
— et poser une valeur par défaut au jugement reviendrait à inventer un
réglage qui décide de ce qui est publié (CLAUDE.md §2).

---

## 6. Les journaux

Le fichier `compose.yml` borne les journaux d'accès à 30 Mo. C'est un
compromis, et il mérite d'être reconsidéré : **un journal d'accès nginx
contient les adresses IP**, c'est-à-dire une donnée personnelle, dans une
application dont l'argument est de n'en collecter aucune.

Le réglage cohérent avec le produit est de les couper :

```nginx
access_log off;
```

Ce qu'on perd : la capacité de diagnostiquer une panne à partir des traces.
Ce qu'on gagne : ne pas avoir à écrire une politique de conservation pour une
donnée qu'on n'a pas voulue. Pour une application qui ne vend rien et ne
mesure rien, le second l'emporte — mais c'est une décision d'exploitation,
et elle appartient à qui héberge.

---

## 7. Ce qu'un serveur permettrait pour l'IA, et à quel prix

`docs/IA_LOCALE.md` conclut que la génération est hors de portée dans un
navigateur (Phi-3-mini en INT4 : 2,1 Go). Un serveur change cette
arithmétique — et il faut être précis sur ce qu'il change, parce que les deux
usages n'ont rien à voir.

**Servir le modèle : gratuit en vie privée, et un vrai gain.**
Le fichier ONNX de MiniLM (≈ 23 Mo) peut être servi depuis la même origine
que l'application. Aucune donnée ne part : c'est un téléchargement, comme le
reste. On y gagne de n'appeler aucun CDN tiers, ce que la politique de
sécurité peut alors interdire, et de fonctionner hors ligne une fois le
fichier caché. **C'est la seule chose que je recommanderais de faire.**

**Faire tourner le modèle : la promesse tombe.**
Envoyer une question au serveur, c'est y envoyer ce qu'on cherche — donc où
l'on marche, quand, et avec quel niveau. C'est précisément ce que TrailGPT et
AllTrails Peak font, et précisément ce que l'en-tête promet de ne pas faire.
Ce n'est pas plus mal ou moins bien : c'est un autre produit, et il faudrait
le dire avant, pas après.

Entre les deux, il n'y a pas de demi-mesure crédible. « Le serveur ne garde
rien » n'est pas vérifiable par la personne, et une promesse invérifiable ne
vaut pas celle qu'on tient aujourd'hui — qui, elle, se lit dans le compteur
de sorties réseau.
