# Brief — Sentiers

*Premier des trois documents demandés par l'issue #94 (analyse → planification
→ architecture). Écrit le 20/08/2026 à partir de ce qui existe : l'audit
produit, les personas, les issues et le code. Il ne remplace ni
`docs/PRODUCT_AUDIT.md`, qui reste le constat critique daté, ni
`docs/PERSONAS.md` ; il dit ce que le produit est et ce qu'il refuse d'être.*

> **Sur la méthode.** L'issue demande de s'appuyer sur BMAD-METHOD. Le site de
> la méthode (`docs.bmad-method.org`) n'est pas joignable depuis
> l'environnement de développement — le proxy refuse les hôtes externes. Ces
> documents en reprennent donc la **séquence** telle que l'issue la décrit
> (brief, PRD découpé en épopées et récits, architecture), sans prétendre
> respecter un gabarit que je n'ai pas pu lire. Le contenu prime : l'issue
> demande explicitement des documents qui aident à décider, pas un gabarit
> recopié.

## Le problème

Un randonneur régulier accumule des traces GPX pendant des années — montre,
téléphone, applications diverses. Il ne peut répondre à aucune des questions
qui l'intéressent :

- quelle part du GR 7 ai-je réellement parcourue ?
- quels sentiers balisés de mon département me restent-ils ?
- où est le trou le plus proche que je pourrais combler dimanche ?

Ses traces sont pourtant là. Ce qui manque, c'est **la mise en regard des
traces et du réseau balisé**.

## L'utilisateur cible

Le noyau est décrit en détail dans `docs/PERSONAS.md`. En une phrase : **le
randonneur régulier qui collectionne**, celui pour qui « finir le GR 7 » est
un projet, pas une figure de style. Il a déjà une montre, déjà une
application de navigation, et n'en cherche pas une autre.

Autour de lui, deux cercles qui comptent moins mais qu'on ne doit pas
insulter : le randonneur occasionnel qui veut voir ses sorties quelque part,
et le débutant qui cherche « des balades autour de chez moi » — pour qui le
premier écran a été refait (#131).

## Le marché

Le paysage se divise en deux familles, et Sentiers n'est dans ni l'une ni
l'autre.

| Famille | Exemples | Ce qu'ils font | Pourquoi ce n'est pas nous |
|---|---|---|---|
| Préparation et navigation | Komoot, AllTrails, Visorando, IGN Rando | trouver un itinéraire, le suivre, l'évaluer | bases éditoriales, équipes, dix ans d'avance. Combat perdu. |
| Complétion / collection | Wandrer, Statshunters, Squadrats, VeloViewer | « avez-vous parcouru toutes les routes ? » | orientés **vélo** et **réseau routier**, pas sentiers balisés français |

Le créneau est **entre les deux et vide** : la complétion appliquée aux
**itinéraires balisés** (GR, GR de Pays, PR, boucles locales), en France, à
partir de l'open data.

> Les concurrents listés le sont de mémoire et de lecture du marché ; aucun
> n'a pu être vérifié en ligne depuis cet environnement. Les fonctionnalités
> précises, les tarifs et les audiences sont donc à confirmer avant toute
> communication publique.

## Positionnement

**Un carnet de progression, pas un GPS.**

Ce que cela implique, positivement : le chiffre doit être **juste**, il doit
être **expliqué**, et il doit désigner **la suite** (par où continuer). Les
trois sont des chantiers déjà engagés : fiabilisation du matching (#52),
tronçons restants et objectifs (#13), écart entre les deux périmètres (#133).

Le minimum vital de terrain — position GPS, hors-ligne — n'est pas un virage
vers la navigation : sans lui on n'utilise pas l'application en marchant,
donc on n'alimente pas la collection.

## Ce qui ne se fera pas

Cette liste vaut décision, pas humeur. Chaque ligne est un refus assumé, à
rouvrir seulement avec un argument neuf.

- **Pas de compte, pas de serveur applicatif, pas de synchronisation.** Les
  traces ne quittent pas le navigateur. Le prix (rien ne suit d'un appareil à
  l'autre) est assumé et **annoncé**, avec une sauvegarde manuelle pour le
  rendre supportable (#132).
- **Pas de navigation vocale, pas de guidage.** Sentiers n'est pas un outil
  de terrain, et le dire évite l'accident.
- **Pas de fil social, pas de photos, pas de commentaires, pas de notation
  d'itinéraires.** Existe en mieux ailleurs, et dilue le propos.
- **Pas de météo, pas d'hébergements marchands.**
- **Pas de scraping de sources fermées.** Les données viennent
  d'OpenStreetMap et de l'open data public, avec leurs licences citées.
- **Pas de mesure d'audience, pas de traceur, pas de police distante.**

## Ce qui rendrait le produit faux

Trois façons de perdre, à surveiller en permanence :

1. **Un pourcentage faux.** C'est la proposition de valeur entière. Tout
   changement du matching se fait avec un test qui montre le chiffre avant et
   après (`tests/unit/matchingQuality.test.ts`).
2. **Un pourcentage vrai mais incompréhensible.** « Pourquoi 43 % alors que
   j'ai tout marché ? » sans réponse dans l'interface vaut un chiffre faux.
3. **Un réseau balisé incomplet.** Si un cartoguide départemental n'est pas
   dans OpenStreetMap, l'utilisateur voit un trou qui n'existe pas sur le
   terrain (#20, #87, #88).
