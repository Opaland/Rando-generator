---
name: revue-sprint
description: Relit le diff d'un sprint de Sentiers en cherchant ce qu'on y a cassé plutôt que ce qu'on y a réparé. À lancer après chaque sprint, avant de passer au suivant.
---

# Revue de sprint

**Le but n'est pas de vérifier que ça marche — la porte le fait déjà. Le but
est de trouver ce que j'ai cassé en réparant.**

Les trois revues de sprint du cycle 2 ont trouvé six défauts, tous
introduits par le sprint qu'elles suivaient. C'est le rendement normal de
cet exercice : si une revue ne trouve rien, elle a probablement mal cherché.

## La méthode

Prendre le diff complet du sprint :

```bash
git diff <base-du-sprint> HEAD --stat -- src/
git diff <base-du-sprint> HEAD -- src/ | grep -E '^[+-]' | grep -v '^[+-][+-]'
```

Puis, pour chaque changement, poser **la question inverse** de celle qu'on
s'est posée en l'écrivant : qu'est-ce que ce correctif a pu retirer ?

## Les angles qui ont payé

| Angle | Ce qu'il a trouvé |
|---|---|
| **Un correctif a-t-il sacrifié des données pour un compteur ?** | Le repli sur `<rte>` perdait des points valides |
| **Le remède passe-t-il à l'échelle ?** | Le recours au dédoublonnage devenait un mur de 200 clics |
| **Une garde recopiée a-t-elle été oubliée quelque part ?** | `importerSauvegarde` non gardée contre la démonstration |
| **Fait-on confiance à une API non standardisée ?** | `beforeinstallprompt` sans vérifier que `prompt()` existe |
| **Un champ testé est-il vraiment lu par l'application ?** | `sectionsVisibles` : trois drapeaux que rien ne consultait |
| **Ai-je posé un nombre au jugé sans le dire ?** | Les seuils des étoiles |

## Vérifier avant de rapporter

Deux fois, un soupçon s'est révélé faux à la mesure — dont
`overflow-wrap: anywhere` que je croyais couper des mots. **Mesurer, puis
rapporter.** Un faux positif dans une revue coûte la confiance dans les
vrais.

## La sortie

Une PR de revue qui dit, sans enjoliver :

- ce qui a été trouvé, et que c'était de mon fait ;
- ce qui a été vérifié sans suite, avec la mesure ;
- ce qui reste ouvert.
