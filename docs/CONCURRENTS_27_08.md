# Ce que font les autres — relevé du 27/08

Demande de Cédric : « regarde les concurrents ».

Relevé en lisant leurs pages d'accueil, pas des articles à leur sujet. Chaque
citation vient du site lui-même, récupéré le 27/08. Ce document dit **ce qui
est écrit**, et sépare ce qu'on en conclut.

---

## Les cinq, en une ligne chacun

| | ce qu'ils vendent | où ça tourne |
|---|---|---|
| **Wandrer** | « an exploration game where you win by going to new places » | serveur, compte obligatoire |
| **Visorando** | une bibliothèque d'itinéraires français + un traceur | serveur, compte pour publier |
| **HiiKER** | « Don't hike with bad maps » — des fonds topographiques premium | serveur, compte |
| **AllTrails** | des collections d'itinéraires, sponsorisées | serveur, compte |
| **Komoot** | « Join 45 million outdoor enthusiasts » — planification multi-sport | serveur, compte |

**Aucun des cinq ne fonctionne sans compte.** C'est le seul point où Sentiers
n'a pas de concurrent : la trace ne quitte pas le navigateur.

---

## 1. Wandrer — le plus proche de nous, et le plus éloigné

C'est le seul qui mesure une **complétion** :

> Wandrer is an exploration game where you win by going to new places. […] The
> more you meander and traverse new roads, the more points you'll earn. Try to
> complete as much as you can: hike or ride every road.

Deux écarts qui décident, et ils vont dans les deux sens.

**Ce qu'ils font mieux :** la synchronisation. « Just connect your
RideWithGPS, Strava or Garmin account and your activities and data are
synced. » Aucun fichier à déposer. C'est exactement la friction que #329
constate chez nous — et #329 conclut que nous ne pouvons pas la supprimer sans
serveur.

**Ce que nous faisons qu'ils ne font pas :** ils comptent **les routes**, nous
comptons **les itinéraires balisés**. « hike or ride every road » : leur unité
est le réseau routier OSM, la nôtre est la relation `route=hiking`. Un GR n'est
pas une route, et le pourcentage de Sentiers répond à une question que Wandrer
ne pose pas — *quelle part de ce sentier balisé ai-je faite*.

Et c'est un **jeu** : points, succès, défis mensuels réservés aux abonnés,
« your quest to dominating the roads of your city ». Sentiers n'est pas un
classement — c'est un carnet. Ce n'est pas un manque à combler, c'est une
différence à assumer, et à écrire sur la page publique.

## 2. Visorando — le comparable français, et la parité des filtres

Leur panneau de recherche, relevé tel quel :

> Distance **NOUVEAU** · Durée · Difficulté · Dénivelé positif **NOUVEAU** ·
> Activités · Type de tracé : Tous / **Retour au départ** / **Aller simple**

C'est, à un mot près, le panneau « Trouver une sortie » de Sentiers — y compris
la distinction boucle / aller simple. Les mentions « NOUVEAU » disent qu'ils
viennent de les ajouter.

**Conclusion : nous ne sommes pas en retard sur les filtres.** Ce que nous
avons en plus — le sol, l'eau, la proximité GPS — n'existe pas chez eux.

## 3. HiiKER — la confirmation la plus utile

Leur argumentaire de planification :

> Day stages, **accommodation**, **water refills**, alt routes — built for real
> multi-day hikes, not just lines on a map.

Trois de ces quatre choses sont déjà dans Sentiers : `stages.ts` découpe en
étapes, `estUnCouchage` place les refuges et gîtes, les points d'eau sont
filtrables. **La quatrième nous manque : les variantes.**

Un GR porte souvent des variantes (`GR 7A`, une boucle de délestage). Nous les
traitons comme des itinéraires séparés, sans dire qu'ils se rattachent au
tronc. C'est une issue à ouvrir.

Et une phrase à retenir, parce qu'elle vise juste :

> Free offline maps. Always. We never charge for offline maps. **Safety
> shouldn't be a subscription.**

Sentiers peut dire plus fort : rien n'est payant, et rien ne part.

## 4. AllTrails — un modèle que nous ne pouvons pas suivre

Leur page d'accueil est une liste de **collections sponsorisées** : « Wild at
Heart: Dog-friendly adventures — Paramount Pictures », « Adventures for better
health — Amazon Health AI », « Going Ultralight — REI », plus quatre offices de
tourisme.

Ce n'est pas un jugement : c'est un modèle économique cohérent, et il suppose
une audience qu'on monétise. Sentiers ne le peut pas — il n'a pas de compte,
pas de télémétrie, donc rien à vendre. **C'est une contrainte, et elle protège
la promesse.**

## 5. Komoot — l'échelle

« 45 million outdoor enthusiasts », 4,8/5 sur plus de 300 000 avis. Rien à en
tirer côté fonctionnalité ; utile comme repère de ce que « grand public »
signifie dans ce domaine.

---

## Ce que ce relevé change pour Sentiers

**Rien sur les filtres** : parité avec Visorando, avantage sur le sol et l'eau.

**Une fonctionnalité manquante, nommée** : les variantes d'un itinéraire
balisé — la seule des quatre briques multi-jours de HiiKER que nous n'ayons
pas.

**Deux phrases à écrire sur la page publique**, et elles ne sont pas des
slogans mais des faits vérifiables :

1. les cinq concurrents exigent un compte ; Sentiers n'en a pas ;
2. Wandrer compte les routes, Sentiers compte les sentiers balisés — ce sont
   deux questions différentes, et la seconde n'a pas d'autre réponse.

**Et une chose à ne pas faire** : transformer le pourcentage en jeu. Wandrer le
fait très bien, avec des classements et des défis. Le persona de Sentiers n'est
pas celui qui veut dominer sa ville — c'est celui qui veut savoir ce qu'il lui
reste du Pilat.

---

## Limite de ce relevé

Les pages d'accueil vendent, elles ne décrivent pas. Ce document ne dit rien de
la **qualité** de ces produits, ni de ce qu'ils font une fois connecté — je
n'ai créé aucun compte. Il dit ce qu'ils annoncent, ce qui suffit pour situer
Sentiers et pas pour les juger.
