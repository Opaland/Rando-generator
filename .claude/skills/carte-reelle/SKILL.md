---
name: carte-reelle
description: Voir Sentiers tourner sur le réseau réel — vraies tuiles IGN, vrai Overpass, vraies données départementales — au nom des personas, avec captures et vrais PDF rendus en image. À lancer pour la démonstration de fin de sprint, et dès qu'une couche de carte ou une impression change.
---

# La carte réelle

**Les e2e tournent contre des bouchons que j'ai écrits moi-même.** Le fond
de carte y est un PNG transparent de 1×1, l'altimétrie rend `800 + i × 3`
(`docs/AUDIT_LOCAL_26_08.md`). Ce qu'ils ne peuvent pas voir, la carte
réelle le montre en une capture. Le 21/10, elle a trouvé en une journée :

- le crédit de la carte peignant le bas de la fiche au PC ;
- les boucles de l'Ain **invisibles** à l'échelle de la marche — MapLibre
  disait en rendre quatre autour de Culoz, la capture n'en montrait aucune ;
- le gros texte, dernier réglage qu'on trouve ;
- des boutons sur le papier, sur un vrai PDF.

Aucun de ces quatre n'était visible dans un test vert.

## Le geste

1. **Jamais pendant une porte** : deux Chromium sur quatre cœurs font
   expirer les `expect.poll` (§6), et un build pendant les e2e change
   l'application sous les tests (§6quater).
2. `npm run build`, puis servir `dist/` **à la racine** :
   `npx vite preview --port 4180 --strictPort` (en arrière-plan). La base
   est `./` : sous `/Rando-generator/`, l'index se charge mais pas ses
   scripts — page blanche, et ce n'est pas l'application.
3. Un script Node **dans le scratchpad**, jamais dans `tests/e2e/` (il
   partirait dans la suite) ni dans le dépôt :

   ```js
   import { createRequire } from 'node:module'
   const require = createRequire('<racine du dépôt>/package.json')
   const { chromium } = require('@playwright/test')
   ```

   Un contexte par persona, configuré **comme la persona** avant la
   première mesure (§1bis) : largeur, `hasTouch`, `isMobile`, gros texte,
   `colorScheme`.
4. Captures, puis **les regarder** (Read sur l'image). Une capture qu'on ne
   regarde pas ne garde rien (§6quater).

## Les pièges, mesurés le 21/10

- **`zone-meta` vit dans la feuille** : au téléphone, repliée, il n'est
  jamais « visible ». Attendre avec `waitFor({ state: 'attached' })`.
- **Overpass réel est lent** : une zone départementale (783 relations dans
  l'Ain) peut prendre plus de deux minutes, ou expirer. Un échec de ce
  genre se relance une fois avant d'être lu comme un défaut ; une capture
  au moment de l'échec dit lequel des deux.
- **« Rendu » n'est pas « visible »** : `queryRenderedFeatures` compte ce
  que MapLibre dessine, pas ce qui se distingue du fond IGN. Pour une
  couche, un gros plan recadré (`screenshot({ clip })`) au zoom de la
  marche (14), sur un lieu où la donnée existe.
- **Le réglage d'affichage** : depuis #576 il est en tête de l'onglet
  Réglages, déplié ; `getByTestId('gros-texte').check()` suffit.
- `window.__sentiersMap` donne la carte (`jumpTo`, `queryRenderedFeatures`) ;
  `window.__sentiersReseauDeFond` le nombre de lignes du réseau de fond.

## L'impression, sur un vrai PDF

`emulateMedia('print')` ne pagine pas. Pour juger le papier :

1. `page.emulateMedia({ media: 'print' })` puis
   `page.pdf({ path, format: 'A4' })` — une A4 fait 794 px CSS, **sous le
   point de rupture** : le papier s'imprime en disposition téléphone ;
2. le rendre en image avec pdf.js, installé **dans un dossier isolé du
   scratchpad**, jamais dans le dépôt :
   `npm i pdfjs-dist@4.10.38 @napi-rs/canvas@0.1.65`, puis
   `getDocument` → `page.render` sur un canvas → PNG, et le regarder ;
3. les boîtes de texte de pdf.js (`getTextContent`) disent où est un texte,
   **pas s'il est peint** : un texte réservé aux lecteurs d'écran, ou caché
   sous un aplat opaque, y figure quand même. Le 21/10, elles ont fait
   croire à un crédit en haut de page qui n'y était pas peint — c'est
   l'image qui a tranché.

`pdftotext` de cette machine est celui de xpdf 4 : pas de `-bbox`.

## La sortie

Par persona : ce qu'elle voit (capture), ce qui marche, ce qui ne marche
pas. Un défaut mesurable se corrige avec un test vu rouge ; ce qui demande
une décision s'ouvre en issue avec la capture décrite. Le bilan va dans
l'issue de l'épopée du sprint.
