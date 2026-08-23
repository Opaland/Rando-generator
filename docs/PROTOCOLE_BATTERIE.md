# Protocole de mesure de la batterie — enregistrement d'une sortie

Issue #152, pierre 4. Ce fichier est là **parce que la mesure n'est pas
faite**, et que la feuille de route pose une condition qui ne se contourne
pas :

> « La batterie se mesure avant qu'on promette quoi que ce soit. Une position
> haute précision en continu vide un téléphone. Le chiffre s'annonce, comme
> le reste. »

Aucun chiffre n'est donc affiché nulle part dans l'application au sujet de
l'autonomie, et aucun ne le sera avant que ce protocole ait été suivi. Ce
qui suit dit **quoi mesurer, comment, et ce qu'on en fera**.

---

## Pourquoi ça ne se mesure pas ici

L'API `navigator.getBattery()` est retirée de Firefox et de Safari, et
n'expose sur Chrome qu'un pourcentage arrondi que le système lisse. Un
navigateur sans écran, sur une machine branchée au secteur, ne consomme par
ailleurs rien de comparable à un téléphone dans un sac à dos : le GPS y est
simulé, l'écran n'existe pas, le processeur n'est pas bridé par la chaleur.

**Ce que le dépôt peut mesurer, il le mesure** —
`tests/unit/sortieLongue.perf.test.ts` vérifie qu'une sortie de quatre
heures ne coûte pas plus cher à sa dernière minute qu'à sa première. C'est
la moitié algorithmique du problème, et elle est verte. L'autre moitié est
physique.

---

## Ce qu'il faut mesurer

Trois chiffres, et pas un de plus :

1. **le pourcentage de batterie consommé par heure d'enregistrement**,
   écran éteint, application en arrière-plan ;
2. **le même, écran allumé sur l'écran de marche** — parce que c'est ce que
   font les gens qui regardent leur distance ;
3. **le nombre de positions reçues par minute**, qui dit si le système a
   ralenti le suivi en arrière-plan. Une autonomie flatteuse obtenue en
   perdant la moitié des points n'est pas une bonne nouvelle : c'est un
   trou dans la trace.

Le troisième est celui qu'on oublie, et c'est lui qui explique les deux
autres.

## Comment

Deux appareils au minimum, parce qu'un seul ne dit rien : un téléphone
récent et un téléphone de cinq ans. Idéalement un iPhone et un Android —
les deux systèmes gèrent l'arrière-plan différemment, et c'est justement
l'arrière-plan qui décide.

Pour chaque appareil :

1. charger à 100 %, débrancher, attendre dix minutes ;
2. noter le pourcentage, l'heure, le modèle, la version du système, le
   navigateur ;
3. démarrer une sortie dans Sentiers, verrouiller l'écran, **marcher
   réellement** — un téléphone immobile ne sollicite pas le GPS de la même
   façon ;
4. après une heure exactement : déverrouiller, noter le pourcentage et le
   nombre de points (visible dans les chiffres de la sortie) ;
5. laisser tourner une seconde heure, écran allumé sur l'écran de marche,
   luminosité à mi-course ;
6. noter à nouveau, puis terminer la sortie.

Répéter une fois par appareil un autre jour : une seule séance mesure
autant la météo et la couverture réseau que l'application.

## Ce qu'on en fera

- **Si la consommation dépasse 15 %/h écran éteint**, l'enregistrement
  n'est pas utilisable sur une sortie de journée sans batterie externe, et
  il faut le dire à l'écran plutôt que le laisser découvrir à 16 h dans une
  gorge. C'est alors la piste des seuils de filtrage qui s'ouvre (distance
  minimale entre deux points, intervalle minimal) — et ces seuils
  **changent ce qui est compté comme parcouru**, donc ils se choisissent
  sur les mesures de cette séance, jamais au jugement (CLAUDE.md §2).
- **Si le nombre de points s'effondre en arrière-plan**, c'est un défaut de
  fiabilité avant d'être un défaut d'autonomie : une trace trouée
  s'apparie mal, et le pourcentage de progression devient faux sans que
  personne ne s'en aperçoive.
- **Dans tous les cas**, le chiffre mesuré s'affiche là où l'on démarre une
  sortie. Pas une fourchette rassurante : le chiffre, avec l'appareil sur
  lequel il a été relevé.

## Feuille de relevé

| | Appareil A | Appareil B |
|---|---|---|
| Modèle, système, navigateur | | |
| Batterie au départ | | |
| Après 1 h, écran éteint | | |
| Points reçus pendant cette heure | | |
| Après 2 h, écran allumé | | |
| Points reçus pendant cette heure | | |
| Distance totale relevée | | |
| Distance réelle (autre source) | | |

La dernière ligne n'est pas décorative : l'écart entre la distance relevée
et la distance réelle dit ce que le bruit GPS ajoute, et c'est l'autre
chiffre qu'on ne peut pas inventer.
