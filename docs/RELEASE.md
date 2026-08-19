# Checklist de release — smoke test « données réelles »

Les tests automatisés ne touchent **jamais** la vraie API Overpass ni les
vrais serveurs de tuiles (c'est voulu). Avant d'annoncer une version, dérouler
une fois ce parcours à la main sur le site déployé :

1. Ouvrir https://opaland.github.io/Rando-generator/ dans un navigateur en
   navigation privée (cache vide).
2. Vérifier que le fond **Plan IGN** s'affiche (pas le repli OSM) et que les
   attributions IGN + OpenStreetMap sont visibles.
3. Charger **« PNR du Pilat »** : message d'attente affiché, réponse en
   30 s – 2 min, itinéraires visibles sur la carte et dans la liste.
4. Importer **3 GPX réels** : pourcentages cohérents en moins de 5 s après la
   réponse Overpass, tronçons parcourus colorés selon le réseau.
5. Passer la tolérance à 25 m puis 100 m : recalcul visible et cohérent
   (le % baisse puis remonte).
6. Recharger la page : zone, traces et tolérance restaurées **sans** nouvel
   appel Overpass (vérifiable dans l'onglet Réseau).
7. Cliquer « Actualiser les tracés » : nouvel appel Overpass, données à jour.
8. Parcours clavier : Tab à travers zones, import, liste, tolérance ;
   Échap ferme la fiche itinéraire ; contrastes lisibles.
9. Ouvrir la page À propos : licences, mention des marques, avertissement de
   prudence présents.
10. Répéter 1–4 sur un téléphone réel (voir issue #14 pour l'audit complet).

En cas d'échec d'une étape : ouvrir une issue avec la version, le navigateur
et une capture, avant toute communication.
