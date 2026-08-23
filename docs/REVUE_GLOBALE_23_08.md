# Revue globale multi-personas — 23/08/2026, fin de journée

Douze PR fusionnées et déployées dans la journée. Cette revue ne relit pas
leurs diffs : elle regarde **l'application**, et la parcourt par les yeux des
six personas. Ce qui suit se trouve dans des fichiers qu'aucun sprint n'a
touchés, ou dans des textes qu'un sprint a rendus faux sans les toucher.

## Déploiement

`main` vert. CI #531 et déploiement #160 sur `0044b4c`. Vingt-huit exécutions
consécutives sans rouge réel.

---

# Les six parcours, ce soir

## Bernard — **débloqué**

Sauvegarde exportable et réimportable (#132), et le prix du « rien ne quitte
votre navigateur » est annoncé dans l'écran lui-même. Plus rien à signaler.

## Sylvie — **débloquée de bout en bout, et c'est neuf de ce matin**

Chercher sa ville (#131), comprendre le vocabulaire (#145), et depuis
aujourd'hui cocher un itinéraire sans trace GPX (#158). Le seul persona pour
qui l'application était inutilisable de bout en bout ne l'est plus.

**Mais une friction est née ce matin, et c'est le principal apport de cette
revue.** Sylvie coche quinze PR. Son tableau de bord affiche :

> **0 %**
> Aucune sortie importée pour l'instant — 340 km à découvrir dans cette zone.

Le grand chiffre est un zéro, et la phrase en dessous **contredit ce qu'elle
vient de faire**. Ce texte était juste hier ; #158 l'a rendu faux sans le
toucher, parce qu'il teste `tracks.length === 0` — et Sylvie n'aura jamais de
trace. C'est exactement le défaut que #172 avait corrigé pour un autre cas :
un zéro nu se lit comme un calcul en panne.

→ **Sprint 1.**

## Camille — **deux manques sur trois comblés aujourd'hui**

Préparer hors connexion (#153, quatre pierres) et emporter son découpage
(#161 point 2) sont livrés.

Reste : **les étapes ignorent les refuges**. Un découpage tous les 22 km qui
la fait dormir à 4 km d'un refuge est joli sur le papier et inutilisable sur
le terrain.

→ **Sprint 3.**

## Karim — **débloqué**

L'archive de 800 activités est mesurée (#159 : 94,7 s, 91 Mo, rien de perdu),
et l'écart des sorties hors zone est désormais expliqué à l'écran
(`global-hors-zone`). Plus rien à signaler.

## Marc — **débloqué ce soir**

Le constat mène à l'action : lien vers la relation OpenStreetMap, cadré sur
la plus grande interruption (#160).

## Léa — **toujours bloquée, et le code affirme le contraire**

Son PDIPR départemental s'importe. Il arrive dans « Mes itinéraires », réseau
`PERSO`. Et `gpxAttributionFor` répond :

```ts
case 'PERSO':
  // Tracé de l'utilisateur : rien à attribuer, c'est le sien.
  return null
```

**Ce commentaire est faux dans son cas.** Le tracé n'est pas le sien : c'est
celui de son département, publié sous Licence Ouverte, laquelle **oblige** à
l'attribution. Exporter en GPX un sentier importé de cette façon produit un
fichier sans attribution — et le mécanisme existe pourtant déjà, pour les
boucles de la Métropole (`LOCAL`, `METROPOLE_ATTRIBUTION`).

L'écart était noté comme « assumé » dans les personas. Il ne l'est plus
vraiment depuis qu'un chemin d'import généraliste existe.

→ **Sprint 2.**

---

# Ce qui a été mesuré sans trouver de défaut

Ça vaut d'être dit, sinon la revue ne rapporte que des mauvaises nouvelles et
personne ne sait ce qui a été regardé.

- **Injection HTML.** Un seul point : `setHTML(poiPopupHtml(props))` sur les
  infobulles de points d'intérêt. Les trois interpolations venues
  d'OpenStreetMap — nom, capacité, type — passent toutes par `escapeHtml`.
  Vérifié ligne à ligne, pas seulement là où j'y pensais.
- **URLs venues du dehors.** `href={website}` (Overpass) et
  `href={itin.details.lienWeb}` (Métropole) sont tous deux gardés par
  `/^https?:\/\//i` : un `javascript:` est refusé à la source. Cherché un
  troisième chemin — l'import GeoJSON de Léa — et il n'existe pas :
  `GeoJsonTrail` ne porte que `name` et `lines`.
- **`npm audit --omit=dev`** : zéro vulnérabilité.
- **Le résumé partageable** ne lit que `matching.global` : le déclaratif de
  #158 ne peut pas le contaminer, par construction.

---

# Dette, chiffrée

| Fichier | Lignes | Référence |
|---|---:|---|
| `src/store/appStore.ts` | **2 316** | 1 566 à l'ouverture de #155 |

**+48 %.** La première tranche de #155 (#245) en avait retiré 213 ; la
journée en a remis davantage. Ce n'est pas un adjectif, c'est un chiffre, et
il va dans le mauvais sens.

→ **Sprint 1**, une tranche de plus.

## Surface d'API

Vingt et un symboles exportés sans usage hors de leur fichier. **Vérifiés à
la main** — la méthode prévient que le détecteur ment, et il a menti : vingt
d'entre eux servent chez eux (`FLAT_KMH` deux fois, `drawSummaryCard` appelée
par `summaryCardBlob`…).

Un seul est réellement mort : **`FOND_DE_REPLI`** dans
`src/core/telechargement.ts`, exporté hier avec le commentaire « Exporté pour
les tests » — alors qu'aucun test ne s'en sert.

Deux commentaires qui mentent trouvés dans la même revue, sur des sujets sans
rapport. Le motif mérite d'être noté : **un commentaire qui justifie une
existence est une affirmation, et elle vieillit comme les autres.**

→ **Sprint 1.**

## Poids livré

| Ressource | Octets |
|---|---:|
| `MapView-*.js` | 955 805 |
| `maplibre-gl-worker-*.js` | 470 280 |
| `index-*.js` | 357 680 |
| CSS (deux fichiers) | 140 494 |

MapLibre pèse les trois quarts du livré, et il est déjà en fragment séparé :
la carte ne se charge qu'avec la carte. Rien de neuf ce cycle.

---

# Les trois sprints qui suivent

1. **Ce qu'on dit de ce qu'elle a fait** — le zéro de Sylvie, les deux
   commentaires qui mentent, une tranche de dette.
2. **Rendre à qui de droit** — l'attribution de Léa, obligation de licence.
3. **Décider une étape en montagne** — les refuges dans le découpage, et
   filtrer par ce qu'il y a sur le chemin.
