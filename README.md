# Kongo Gaz

Kongo Gaz est une plateforme web de commande et de livraison de bouteilles de gaz
ménager (GPL) à domicile à Kinshasa, avec une interface de gestion centralisée.

L'application permet aux utilisateurs de commander la livraison de bouteilles de
gaz directement à leur domicile tout en offrant un tableau de bord administratif
pour la supervision centralisée. Les administrateurs gèrent l'ensemble du
processus : suivi des commandes, coordination des vendeurs, planification des
itinéraires et gestion des dépôts. Le système intègre un suivi GPS et une
synchronisation en temps réel pour une coordination efficace des livraisons.

## Stack technique

- **TanStack Start** (Vite + Nitro, rendu serveur)
- **React** 19 + **TypeScript**
- **Tailwind CSS** v4
- **Supabase** (base de données, authentification, stockage)
- **Resend** (emails de notification aux gérants de dépôts)

## Développement

Prérequis : Node.js et npm.

```sh
npm install
npm run dev
```

Le serveur de développement écoute sur le port 8080.

## Build de production

```sh
npm run build
```

Le build Nitro cible Cloudflare Modules (compatible Workers).
