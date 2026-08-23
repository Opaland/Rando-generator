# Revue globale de fin de cycle — 23/08/2026

Trois sprints depuis la revue d'ouverture, seize PR fusionnées dans la
journée. Cette revue-ci regarde l'application après coup : ce que les sprints
ont réglé, ce qu'ils ont déplacé, et ce qu'ils ont laissé.

## Déploiement

`main` vert. Aucun rouge réel de la journée.

---

# Les six parcours, après les trois sprints

| Persona | Ce matin | Ce soir |
|---|---|---|
| Bernard | débloqué | débloqué |
| **Sylvie** | débloquée, mais son bilan la contredisait | **débloquée** |
| **Camille** | deux manques sur trois | **débloquée** |
| Karim | débloqué | débloqué |
| Marc | débloqué le soir même | débloqué |
| **Léa** | bloquée, licence non respectée | **débloquée** |

**Les six parcours passent.** C'est la première fois.

Ce qu'il faut aussitôt tempérer : **aucun de ces six parcours n'a été
parcouru par une personne.** Ils ont été rejoués par lecture du code et par
tests. Sylvie qui n'a pas de GPX, Camille qui prépare au refuge, Léa qui
importe son PDIPR — les trois nouveautés du jour n'ont été vues par personne
d'autre que moi (CLAUDE.md §10).

---

# Ce que les sprints ont réglé, et ce que ça a coûté

## Un motif : les commentaires qui mentent

**Trois** trouvés dans la journée, sur des sujets sans rapport :

- « Exporté pour les tests » — aucun test ne s'en servait (`FOND_DE_REPLI`) ;
- « Tracé de l'utilisateur : rien à attribuer, c'est le sien » — faux pour un
  PDIPR importé, et c'était une violation de licence ;
- « relit la base, donc rien n'est perdu » — ne relisait pas les
  déclarations.

Aucun n'était faux quand il a été écrit. **Un commentaire qui justifie une
existence est une affirmation, et elle vieillit comme les autres.** C'est la
leçon du cycle, et elle mériterait une ligne dans `CLAUDE.md`.

## Un second motif : les tests qui supposent un ordre

**Deux** courses trouvées par la porte, dans des fichiers sans rapport :

- `fermerLeGuide` vérifiait la présence du guide **puis** cliquait ;
- `loading.spec.ts` posait sa fonction de relâchement depuis le gestionnaire
  de route et l'appelait avec `?.()` — silencieusement sans effet s'il
  n'avait pas encore tourné.

Les deux échouaient **uniquement sur la suite complète**, jamais isolées.
C'est la signature de cette famille. Le remède est le même : cesser de
chercher un ordre sûr, boucler sur l'état final voulu.

## Trois choses trouvées en vérifiant mes propres tests

- un registre de couchages qui était **du code mort** : la garde d'ordre le
  rendait inutile, et le test qui l'affirmait passait pour une autre raison ;
- une injection e2e qui a fait **échouer le build en silence** — Playwright a
  testé un `dist/` périmé, en passant. C'est la garde `grep "✓ built"` qui l'a
  rattrapé, exactement comme §6 le prévoit ;
- un détecteur d'exports morts qui a rendu **21 candidats dont 20 faux**.

---

# Dette, chiffrée

| Fichier | Ce matin | Ce soir | Écart |
|---|---:|---:|---|
| `src/store/appStore.ts` | 2 316 | **2 212** | −4,5 % |
| `src/components/ItineraryDetail.tsx` | 477 | **517** | **+8,4 %** |

`appStore.ts` recule pour la première fois de la journée. Il reste à **+41 %**
de son point d'ouverture (#155, 1 566 lignes) : la tranche extraite est réelle
mais la dette vient de loin.

**`ItineraryDetail.tsx` est le nouveau point de concentration**, et c'est
mécanique : emporter, déclarer, l'effort, la source, les refuges, le lien
OSM — tout ce que la journée a livré s'y est posé. C'est le fichier à
surveiller au prochain cycle, avant qu'il devienne ce qu'`appStore.ts` a été.

## Mesuré sans trouver de défaut

- **aucun export mort**, cette fois ;
- **aucun nouveau point d'injection** : toujours un seul `setHTML`, toujours
  échappé ; les trois `href` venus du dehors toujours gardés par
  `/^https?:\/\//i` ;
- poids livré inchangé — MapLibre pèse toujours les trois quarts, et reste en
  fragment séparé.

---

# Ce qui reste ouvert, et pourquoi

## Bloqué sur une décision qui n'est pas la mienne

- **#203** — « je ne tranche pas seul », et cela dépend d'une fréquence non
  mesurée ;
- **#154** — la feuille de route dit de le vérifier auprès d'une personne
  avant de le construire. Frontière du « pas de navigation » ;
- **la mesure de batterie** (`docs/PROTOCOLE_BATTERIE.md`) ;
- **#150** — le seuil de vitesse, faute de corpus (#204).

## Ouvert et faisable

- **#156**, première partie : filtrer par ce qu'il y a sur le chemin. Demande
  les POI de **toute la zone**, alors qu'ils ne sont téléchargés qu'à
  l'ouverture d'une fiche — c'est un choix de moment à faire exprès ;
- **#87**, le reste : intégrer les PDIPR départementaux eux-mêmes. Le volet
  licence est réglé, le volet données non ;
- **#151**, **#175**, **#179**, **#178**, **#171**.
