---
name: sonde
description: Écrire un test qui trouve vraiment le défaut — la procédure de réinjection, et les quatre façons dont une assertion peut être verte pour rien. À utiliser pour tout test écrit après coup, et avant d'affirmer qu'un test « couvre » quoi que ce soit.
---

# Écrire une sonde qui discrimine

**Un test qui ne peut pas échouer ne prouve rien.** Ce n'est pas une maxime :
c'est le mode d'échec le plus fréquent de ce dépôt, et il ne se voit jamais à
la relecture. Un test vert ressemble exactement à un test qui ne teste rien.

## La procédure, en entier

1. Écrire le test.
2. **Retirer le correctif** — pas le commenter dans sa tête : le retirer dans
   le fichier.
3. Relancer. **Le regarder échouer**, et lire le message : dit-il ce qu'on
   croyait mesurer, ou autre chose ?
4. Remettre le correctif. Relancer. Vert.
5. `git diff` pour vérifier qu'on a bien tout remis.

L'étape 3 est celle qui trouve quelque chose. Deux fois, le message d'échec
disait un chiffre inattendu et c'est *ce chiffre* qui a mené au vrai défaut.

Quand la réinjection est fastidieuse, l'agent `verificateur-de-tests` la fait.
Le fastidieux est exactement là où on saute l'étape.

## Les quatre façons d'être vert pour rien

Toutes mesurées ici, toutes après avoir cru le contraire.

| Ce qu'on écrit | Ce que ça demande réellement |
|---|---|
| `toBeVisible()` | « as-tu un rectangle non vide ? » — un contenu écrêté par un ancêtre en `overflow: hidden` répond oui. Quatre tests verts sur un panneau haut de 52 px qui ne montrait rien. |
| `toContainText()` | « le mot est-il dans le `textContent` ? » — `display: none` compris. |
| une mesure sans `expect.poll` | « quelle hauteur pendant la transition ? » — 821 px relevés là où la feuille en fait 52, parce que `data-position` change avant la hauteur. |
| une assertion sur la première étape | l'étape 1 part de zéro : `fin + 0` et `fin − 0` donnent le même nombre. Trouvé par la mutation, pas par moi. |

Ce qu'il faut demander à la place :

```ts
// « qu'est-ce qui est peint ici ? »
await estAlEcran(page, element)      // tests/e2e/helpers.ts
// « ce texte est-il visible ? » — pas « ce mot existe-t-il ? »
await expect(locator).toBeHidden()
// toute mesure qu'une transition CSS peut traverser
await expect.poll(() => mesure()).toBeLessThan(60)
```

**La règle générale, dont ceci n'est qu'un cas : une assertion qui pourrait
passer pour une raison qu'on n'a pas voulue n'est pas une assertion.**

## Une sonde ne voit qu'où elle regarde

La première version des règles d'écran n'auscultait que l'écran d'accueil.
Une injection remettant le profil écrasé passait au vert — le profil n'existe
pas encore à ce moment-là. Élargie à trois états, la même sonde a trouvé du
neuf le jour même.

Avant de dire « couvert », demander : **dans quel état, à quelle largeur, avec
quelles préférences ?** Le mode gros texte a caché un défaut pendant tout un
sprint pour cette seule raison.

Et pour le tactile : `@media (pointer: coarse)` ne s'active pas sans
`hasTouch: true` dans la vue Playwright. Sans lui, le test mesure le plancher
de bureau en affirmant mesurer celui du doigt.

## Les courses ne se voient qu'en suite complète

Signature : le test échoue *seulement* quand toute la suite tourne, jamais
isolé. La fenêtre ne s'ouvre que sous charge.

Le remède n'est pas de chercher un ordre sûr : c'est de **boucler sur l'état
final voulu**. Un `catch` dans une telle boucle n'avale pas une assertion — il
avale une tentative, dans une convergence qui, elle, est assertée.

## Ce qu'on écrit à côté

Quand la réinjection montre qu'un mutant ou une variante est **équivalent** —
même résultat par un autre chemin — l'écrire dans le test. Sinon on le
rechasse à la vague suivante, et on finit par le corriger à tort.
