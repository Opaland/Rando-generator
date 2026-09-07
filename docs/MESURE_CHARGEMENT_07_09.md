# Le premier affichage utile, mesuré (issue #446)

Ce document ne dit pas si le premier chargement est trop lent. Il établit les
trois chiffres que #446 demandait avant toute décision, et rien de plus — la
mesure tranche l'hypothèse, pas la priorité de #93.

Mesuré le 07/09 par `tests/e2e/premier-chargement.spec.ts` (`npm run
chargement`), sur le build de production servi par `vite preview`.

**Deux exécutions successives** rendent des chiffres proches mais non
identiques (panneau de zone à froid : 5 291 ms puis 5 098 ms ; à chaud :
1 129 ms puis 724 ms) — une seule mesure de chronomètre n'est jamais exacte
au milliseconde près. Les chiffres cités ci-dessous sont ceux de la première
exécution ; ce qui compte est l'ordre de grandeur et le rapport entre les
lignes d'un même tableau, pas la valeur exacte.

## Le profil de test

Un profil réseau et CPU fixe, choisi pour ce test — **pas** une reproduction
certifiée d'un préréglage « Slow 3G » de Chrome DevTools ou de Lighthouse :
ces chiffres précis n'ont pas pu être vérifiés depuis cet environnement, et
prétendre le contraire serait le faux confort que le §2 interdit.

- débit : 300 Kb/s (téléchargement et envoi)
- latence : 400 ms
- CPU ralenti ×4 (`Emulation.setCPUThrottlingRate`, un paramètre du
  protocole CDP dont la valeur est directement ce qu'elle dit — pas un
  seuil emprunté à une norme)

## Les trois questions de #446, chiffrées

### 1. Le temps jusqu'au premier affichage utile

| repère | cache froid | second chargement (service worker) |
|---|---:|---:|
| `first-paint` | 1 568 ms | 132 ms |
| `first-contentful-paint` | 5 176 ms | 552 ms |
| panneau de zone visible | **5 291 ms** | **1 129 ms** |

Sous ce profil, l'interface utilisable (le panneau de recherche de zone,
premier repère stable de l'écran) apparaît en **5,3 secondes** au premier
chargement — lent en absolu, mais dominé par l'exécution du bundle
principal sous CPU ralenti, pas par le poids de la carte (question 2).

### 2. Le poids de MapView pèse-t-il sur ce premier affichage ?

`MapView` est chargé en différé (`lazy()` dans `App.tsx`), et `dist/index.html`
ne porte aucune balise de préchargement pour son chunk — seuls `index-*.js`
(387 Ko) et `index-*.css` (62 Ko) sont sur le chemin bloquant.

| | cache froid |
|---|---:|
| panneau de zone visible | 5 291 ms |
| chunk `MapView-*.js` terminé | 5 473 ms |

**Le panneau de zone apparaît 182 ms avant que le chunk de la carte n'ait
fini d'arriver.** La carte ne bloque donc pas le rendu du premier écran :
son téléchargement se déclenche en parallèle, sans retarder ce que la
personne voit en premier. Ce qu'il faut lire avec prudence : les deux
finissent à peu près en même temps plutôt que le petit bundle terminant
nettement avant le gros, ce qui suggère que le débit simulé par CDP
(`Network.emulateNetworkConditions`) ne modélise pas forcément une
contention de bande passante partagée entre requêtes simultanées comme le
ferait un vrai lien 3G physique — une limite de la mesure, pas seulement
un résultat.

### 3. Ce que le service worker change au second chargement

| | cache froid | second chargement |
|---|---:|---:|
| `first-paint` | 1 568 ms | 132 ms (**×11,9**) |
| `first-contentful-paint` | 5 176 ms | 552 ms (**×9,4**) |
| panneau de zone visible | 5 291 ms | 1 129 ms (**×4,7**) |
| chunk `MapView-*.js` terminé | 5 473 ms | 556 ms (**×9,8**) |

Le service worker précache tout, `MapView` compris : au second chargement,
même la carte finit d'arriver dix fois plus vite. C'est le cas courant pour
quelqu'un qui revient — la cible même de #446 (Sylvie, sur le terrain, avec
un réseau incertain).

## Ce que ce document ne tranche pas

Que #93 (tuiles vectorielles) doive passer de P3 à une priorité plus haute.
Le poids de la carte ne bloque pas le premier affichage sous ce profil — ce
qui va plutôt dans le sens de laisser #93 où elle est — mais la mesure porte
sur un seul profil réseau, une seule machine simulée, un seul run. Une
décision de priorité mérite plus qu'une mesure.
