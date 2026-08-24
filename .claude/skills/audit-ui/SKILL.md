---
name: audit-ui
description: Auditer l'interface de Sentiers en mesurant ce qui est peint — recouvrements, écrasements, débordements, cibles tactiles, cadrage — à trois largeurs, dans trois états et en gros texte. À lancer après un lot de mise en page, et quand quelqu'un dit « ça ne va pas » sans savoir pourquoi.
---

# Audit d'interface

Le 24/08, Cédric a vu en trois secondes deux défauts vieux de plusieurs
semaines : un profil altimétrique écrasé de trente pour cent, et une fiche
dont le bas était peint par la barre d'onglets. Aucun n'était subtil. Aucun
n'avait de test — parce que chaque test vérifiait *une chose voulue à un
endroit*, et que personne ne posait la question générale.

Cette procédure pose les questions générales.

## Ce qui se mesure, et ce qui se décide

**On ne garde ici que ce qui a une réponse en chiffres** : un contraste, un
ΔE, une hauteur en pixels, un rectangle peint. Ni la beauté d'une couleur ni
la clarté d'un texte n'en sont — ces choses se décident, et les prétendre
mesurables serait le faux confort que CLAUDE.md §2 interdit.

Quand un seuil vient d'une norme, la **nommer** : 44 px est WCAG 2.5.5, 24 px
est WCAG 2.5.8. Un seuil emprunté n'a pas le même statut qu'un seuil inventé,
et confondre les deux est précisément ce que le §2 interdit. Le seul nombre
tranché au jugement dans le plancher des cibles est le 32 px du curseur de
bureau, et il est écrit comme tel dans `src/index.css`.

## 1. Lancer la sonde qui existe

```bash
npm run build                                   # et vérifier « ✓ built »
export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
npx playwright test tests/e2e/regles-d-ecran.spec.ts --workers=1
```

`tests/e2e/regles-d-ecran.spec.ts` pose cinq questions mesurables :

1. **qu'est-ce qui est peint par-dessus quoi** — la fiche, le panneau, la
   barre ;
2. **qu'est-ce qui est écrasé** — un dessin dont la boîte n'a pas la forme de
   son contenu ;
3. **qu'est-ce qui déborde sans le dire** — un rognage non déclaré, par
   opposition à un `text-overflow: ellipsis` voulu ;
4. **qu'est-ce qu'on ne peut pas toucher** — le plancher des cibles ;
5. **qu'est-ce qui sort du cadre** — un débordement horizontal de page.

À trois largeurs (390 tactile, 800 tactile, 1280 non), dans trois états
(accueil, zone chargée, fiche ouverte), plus le mode gros texte aux deux
largeurs extrêmes. Trente-six mesures.

Les messages d'échec portent les chiffres : les lire, ne pas les résumer.

## 2. Regarder vraiment

Une sonde ne voit que ce qu'on lui a appris à voir. Prendre des captures aux
trois largeurs, dans l'état visé, et **les ouvrir**.

```ts
await page.screenshot({ path: '/tmp/audit/390-fiche.png', fullPage: false })
```

C'est ainsi qu'ont été trouvés le bouton « Ma position » posé sur la fiche et
le panneau coupé net en bas d'écran — deux choses qu'aucune assertion ne
cherchait.

## 3. Mesurer ce qu'on soupçonne

Le seul outil qui réponde à « qu'est-ce que le doigt touchera ici » :

```ts
document.elementFromPoint(x, y)
```

Un rectangle non vide ne prouve rien. `toBeVisible` accepte un élément écrêté
par un ancêtre en `overflow: hidden` ; `toContainText` lit du `display: none`.
Voir la skill `sonde`.

## 4. Élargir la sonde, pas seulement corriger

Un défaut trouvé à la main est un défaut que la sonde a manqué. Avant de
clore : **quelle question aurait dû l'attraper, et dans quel état ?**

La première version des règles d'écran n'auscultait que l'écran d'accueil ;
une injection remettant le profil écrasé passait au vert. Élargie aux états,
la même sonde a trouvé du neuf le jour même — les cinq commandes de zoom du
profil, à 28 px.

**Une sonde se juge sur ce qu'elle trouve quand on remet un défaut, pas sur le
nombre de ses assertions.**

## 5. Les personas, pour choisir où regarder

Ils ne mesurent rien, ils décident de la vue :

- **Théo** lit mal de près → gros texte, aux deux largeurs extrêmes ;
- **Jeanine** n'a jamais eu de smartphone → première ouverture, guide affiché,
  aucun raccourci connu ;
- **Sylvie** est en montagne, gantée, au soleil → plancher tactile, contraste ;
- **Camille** est sur un grand écran → ce qui reste vide, et ce qui reste caché.

## Rendre

Pour chaque constat : **la mesure** (deux nombres et leur unité), **où**
(largeur, état, élément), **ce que ça coûte** en une phrase concrète, et **ce
qui l'a caché** jusqu'ici.

Et à part, sans les déguiser en constats : **les questions qui demandent une
personne** — presque toujours « montrer l'écran à quelqu'un ». Elles vont dans
`docs/AUDIT_UX_*.md`, pas dans un test.

L'agent `auditeur-ui` mène cette procédure seul quand on veut la lancer sans
y consacrer le fil principal.
