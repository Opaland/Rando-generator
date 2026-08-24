# Sentiers — image de production.
#
# Deux étapes, et la seconde ne contient ni Node, ni les sources, ni les
# dépendances de développement : ce qui n'est pas dans l'image ne peut pas
# être exploité, et ne pèse pas au téléchargement.

# ------------------------------------------------------------------------
# Étape 1 — construire
# ------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Les manifestes d'abord : tant qu'ils ne changent pas, cette couche est
# réutilisée et `npm ci` ne se relance pas. C'est la seule optimisation de
# cache qui compte ici — l'installation dure bien plus que le build.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` enchaîne `tsc -b` puis `vite build`. Le typage fait donc
# partie de la construction de l'image : une image ne peut pas être produite
# à partir d'un code qui ne compile pas.
RUN npm run build

# ------------------------------------------------------------------------
# Étape 2 — servir
# ------------------------------------------------------------------------
FROM nginx:1.27-alpine AS serve

# La configuration par défaut sert le port 80 en root ; la nôtre sert le
# 8080 sans privilèges. Retirer l'ancienne évite qu'elle reprenne la main.
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/sentiers.conf
# Hors de `conf.d/`, que l'image officielle inclut au niveau `http` : la
# directive `set` y est interdite, et nginx refuserait de démarrer.
COPY deploy/csp.conf /etc/nginx/csp.conf

COPY --from=build /app/dist /usr/share/nginx/html

# nginx a besoin d'écrire ses fichiers temporaires et son PID. L'image
# officielle prévoit l'utilisateur `nginx` ; il faut lui donner ces
# répertoires, sinon le conteneur démarre en root ou ne démarre pas.
RUN touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080

# `/sante` ne dépend d'aucun fichier de l'application : il répond même si le
# build a livré un `dist/` vide, ce qui est exactement le moment où l'on veut
# une réponse plutôt qu'un silence.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/sante || exit 1

CMD ["nginx", "-g", "daemon off;"]
