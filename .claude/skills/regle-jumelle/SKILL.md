---
name: regle-jumelle
description: Trouver les règles qui vivent à deux endroits sans le savoir — une liste de sélecteurs recopiée, deux façons de calculer la même distance, un seuil écrit deux fois. À lancer avant de corriger un défaut « qui n'apparaît que là », et quand une correction ne tient qu'à un endroit.
---

# La règle jumelle

Le 25/08, deux défauts trouvés dans la même heure avaient la même forme :

- la liste des commandes que `src/index.css` plancherise et celle que
  `regles-d-ecran.spec.ts` mesure étaient **la même liste, écrite deux fois**,
  avec **le même trou** — ni `select`, ni `input`, ni `textarea`. Vingt-cinq
  commandes n'étaient ni tenues ni surveillées ;
- la distance cumulée le long d'un itinéraire était calculée **trois fois**,
  par trois chemins différents, et sur une relation OSM désordonnée les trois
  rendaient trois nombres — 4 685 m, 10 931 m, et un troisième encore.

Ni l'un ni l'autre n'était visible dans un diff. Les deux fichiers ne changent
jamais ensemble, et chacun paraît complet quand on le lit seul.

C'est le §4 de CLAUDE.md — *une garde transverse se nomme, elle ne se recopie
pas* — vu depuis l'autre bout : **avant** de recopier, on ne le sait pas ;
**après**, plus personne ne le voit.

## 1. Reconnaître la forme

Trois signes, et un seul suffit :

- **« ça ne se produit que sur X »** — un défaut qui ne touche qu'un cas
  particulier vient souvent d'une règle appliquée à un endroit et pas à
  l'autre. La question n'est pas « pourquoi X ? », c'est « **qui d'autre
  aurait dû s'appliquer ici ?** » ;
- **une correction qui ne tient qu'à un endroit** — si corriger demande de
  toucher un fichier alors que la règle est écrite dans deux, le second est
  déjà faux et personne ne le sait ;
- **deux noms pour la même chose** — `totalMeters`, `itineraryCoords`,
  `chainWays` calculent tous « la longueur d'un itinéraire ». Trois noms, trois
  résultats.

## 2. Chercher la jumelle

```bash
# La même liste de sélecteurs, dans deux langages
grep -rn "role='button'\|role=\"button\"" src/ tests/

# Le même seuil, écrit en chiffres à deux endroits
grep -rnE "\b(44|24|32)\b" src/index.css tests/e2e/regles-d-ecran.spec.ts

# Deux façons de parcourir la même structure
grep -rn "of itinerary.ways\|of itin.ways\|\.ways\b" src/core/
```

Le motif générique : **une même notion, deux implémentations**. Ce ne sont pas
les doublons littéraux qui coûtent — `jscpd` les trouve — ce sont les doublons
**sémantiques**, que rien ne rapproche.

## 3. Décider laquelle des trois issues

Par ordre de préférence :

1. **Une fonction nommée**, appelée des deux côtés. Toujours mieux, quand c'est
   possible.
2. **Un test qui asserte que les deux sont d'accord**, quand elles ne peuvent
   pas être partagées — du CSS et du TypeScript ne s'importent pas.
   `scripts/listes-jumelles.mjs` est ce cas : il extrait la liste des deux
   fichiers et vérifie l'inclusion. Il tourne dans `npm run listes`, et dans la
   CI **avant** le typecheck.
3. **Une issue**, quand choisir laquelle a raison change ce qui est calculé.
   C'est le §2 : on ne tranche pas au passage d'une autre correction. #303 est
   ce cas.

Ce qui n'est **jamais** une issue acceptable : un commentaire qui dit « penser
à mettre à jour l'autre ». Le §6quater est formel — s'il faut le lire, il ne
garde rien.

## 4. Prouver que la garde garde

Comme toute sonde (voir la skill `sonde`) : **retirer un élément d'une des deux
listes et regarder le script échouer.** Mesuré le 25/08 sur
`listes-jumelles.mjs` — retirer `select` de la sonde le fait sortir en 1 avec
le nom du genre manquant.

Un garde-fou qu'on n'a pas vu refuser quelque chose n'est pas un garde-fou.
