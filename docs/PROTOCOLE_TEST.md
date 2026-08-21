# Protocole de test — comment savoir sans mesurer en douce

> Décision de méthode, écrite avant d'en avoir besoin (issue #177).
> Elle engage les six sprints du cycle 2 (#180) et tout ce qui suivra.

## Le constat qui commande tout

Un A/B test classique suppose exactement ce que Sentiers refuse : assigner un
variant, mesurer une conversion, **remonter l'événement à un serveur**.

Il n'y a pas de compromis élégant à trouver ici. On ne peut pas faire d'A/B
testing au sens habituel sans trahir ce que le produit promet — et le proposer
serait une faute, pas un arbitrage.

Mais on peut obtenir la même chose — *savoir quelle version marche mieux* —
autrement.

### État vérifié du code

Vérifié le 21/08/2026, et à revérifier avant toute décision qui s'y appuie :

- aucune occurrence d'`analytics`, `telemetry`, `Sentry`, `Plausible`,
  `PostHog`, `gtag`, `Matomo`, `Mixpanel`, `Amplitude` ou `Hotjar` dans
  `src/`, `public/` ou `index.html` ;
- cinq dépendances de production en tout : `idb`, `maplibre-gl`, `react`,
  `react-dom`, `zustand`. Aucune ne parle au réseau pour notre compte.

Les seules requêtes sortantes sont celles qu'« À propos » énumère (issue
#168) : Overpass, les tuiles IGN, les tuiles OSM en repli, l'altimétrie IGN,
l'API Adresse, et l'hébergeur qui sert la page.

---

## La décision

### Voie A — test utilisateur modéré · **principal**

Cinq personnes par persona critique, en observation directe. Deux prototypes ;
chaque participant voit **une seule** version.

On mesure quatre choses :

| Mesure | Comment |
|---|---|
| Réussite de la tâche | Binaire, critère écrit avant la session |
| Temps jusqu'au premier « aha » | Chronomètre, du premier écran au premier chiffre compris |
| Point d'arrêt exact | Ce que la personne regardait, ce qu'elle cherchait |
| Verbalisation | Ses mots, pas notre reformulation |

Pas de significativité statistique — et c'est **assumé**, pas subi. Cinq
personnes ne prouvent rien ; elles montrent où ça casse, ce qu'aucun chiffre
agrégé ne ferait mieux à ce stade.

### Voie B — A/B local, sans rien envoyer · **appoint**

L'assignation se tire sur l'appareil, les compteurs restent en base locale, et
le partage est un **acte volontaire** : un bouton qui prépare un texte, et la
personne décide d'en faire quelque chose ou non.

Biais de sélection massif — ceux qui envoient ne ressemblent pas à ceux qui
n'envoient pas. Utile en complément d'une voie A, **jamais seul**, et jamais
comme argument principal d'une décision.

> Aucun code n'existe pour la voie B à ce jour, délibérément. Elle sera écrite
> quand une question précise la réclamera, pas « pour être prêt » — un canal
> qui existe finit par servir.

### Voie C — A/B serveur · **écartée**

Même auto-hébergée, elle contredit frontalement la promesse. À n'envisager que
le jour où le produit offrirait un mode explicitement séparé, désactivé par
défaut — et même là, elle abîmerait le discours plus qu'elle n'informerait la
décision.

---

## Le piège, écrit pour qu'on s'en souvienne

**Ne pas transformer l'A/B testing en cheval de Troie de la télémétrie.**

L'argument « il faut des données pour tester » est vrai. La réponse n'est pas
d'ouvrir un canal sortant par défaut.

Le jour où quelqu'un proposera un SDK d'analytique « juste pour l'A/B », ce
document répond : **non par défaut ; consentement explicite et séparé, ou
rien.**

La confidentialité *est* le produit. Un test qui l'entame teste la mauvaise
chose.

---

## Les cinq expériences

Chaque critère de réussite est **binaire et écrit ici, avant la session**.
Aucun seuil de succès n'est fixé d'avance : « B fait mieux que A » se constate,
ne se prédit pas.

### E1 — Sylvie · la démonstration au premier lancement (#172)

- **Hypothèse.** Voir un tableau de bord rempli avant d'avoir un fichier
  suffit à comprendre à quoi sert le produit.
- **Tâche.** « Dites-moi ce que fait cette application. » Rien de plus.
- **Réussite (binaire).** La personne énonce, sans aide, que l'application
  mesure la part d'itinéraires qu'elle a parcourue.
- **Sprint.** 5.

### E2 — Karim, Sylvie · menu bas contre accordéons (#171)

- **Hypothèse.** Quatre destinations nommées se parcourent plus vite que dix
  sections repliables.
- **Tâche.** « Ajoutez la sortie que vous avez faite dimanche. »
- **Réussite (binaire).** Le sélecteur de fichier s'ouvre sans que
  l'observateur ait prononcé un mot.
- **Sprint.** 5. **Bloquant pour #171.**

### E3 — Jeanine, Farid · trois choix nommés contre curseur (#174)

- **Hypothèse.** « Strict / Normal / Tolérant » se règle, là où « 25–100 m »
  ne se règle pas.
- **Tâche.** « Votre montre est imprécise sous les arbres et vos sorties ne
  comptent pas. Réglez ça. »
- **Réussite (binaire).** La tolérance est modifiée dans le bon sens, sans
  explication de l'observateur.
- **Sprint.** 3.

### E4 — Théo, Jeanine · mode simple (#173)

- **Hypothèse.** Un mode réduit permet une tâche complète en autonomie à un
  enfant de neuf ans et à une personne âgée.
- **Tâche.** « Montre-moi où tu as marché. »
- **Réussite (binaire).** La trace apparaît colorée sur la carte, sans aide.
- **Sprint.** 3.

### E5 — Tous · confidentialité mise en scène (#178)

- **Hypothèse.** Dire précisément ce qui sort augmente la confiance, au lieu
  de l'entamer.
- **Tâche.** Lecture d'« À propos », puis : « Que sait-on de vous ici ? »
- **Réussite (binaire).** La personne distingue spontanément ses traces (qui
  ne partent pas) des fonds de carte (qui viennent de l'IGN).
- **Sprint.** 6.

---

## Les règles de rigueur

1. **Un critère binaire, décidé avant.** Écrit dans ce document, pas
   reconstruit après coup à la lumière de ce qu'on a vu.
2. **Une hypothèse par test.** Cinq changements simultanés ne disent pas
   lequel a agi.
3. **On ne guide pas.** On note où la personne s'arrête, et on se tait. Le
   silence de l'observateur fait partie du protocole.
4. **Aucun seuil a priori.** On ne décide pas d'avance qu'« il faut 4/5 » :
   on regarde ce qui s'est passé, et on écrit ce qu'on en conclut.
5. **On note ce qui infirme.** Une session qui contredit une hypothèse de
   sprint fait replanifier, elle ne se range pas dans les cas particuliers.

---

## Le préalable, et il est ferme

**#171 (menu bas) ne doit pas être industrialisé avant E2.**

C'est la refonte la plus lourde du backlog, et elle repose sur un jugement de
conception, pas sur une mesure. La valider coûte cinq sessions ; la corriger
après coup coûterait le lot entier.

Un plan qui ne prévoit pas d'avoir tort n'est pas un plan.

---

## Ce que ce document ne dit pas

Il ne dit pas comment recruter les participants, ni combien cela prend de
temps, ni qui observe. Ces questions se posent au moment de conduire E3 et E4
(sprint 3) — les trancher maintenant serait inventer des contraintes qu'on
n'a pas encore rencontrées.

Il ne fixe pas non plus de calendrier : les sessions se placent dans les
sprints indiqués, et l'épique #180 arbitre le reste.
