# Serveur de l'Arène de la Faille

Worker Cloudflare `cds-arene` : un Durable Object par salon, simulation 30 fois par seconde, connexion des joueurs en WebSocket. Il fait tourner deux jeux : l'Arène de la Faille (`sim.js`) et la Défense du Nexus (`td.js`, salons `?game=td`).

- `src/sim.js` : règles, sorts des 9 champions, bots.
- `src/index.js` : salons, comptes (jeton Firebase), envoi de l'état, PO de fin de match via le robot `conseil-riot` (route `/arena`).

Déploiement automatique par GitHub Actions (`.github/workflows/arene.yml`) à chaque modification de ce dossier, ou à la main depuis l'onglet Actions.
Secrets du dépôt : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ARENA_KEY` (même valeur que le secret `ARENA_KEY` du worker `conseil-riot`).

En local : `npm install` puis `npm run dev`, et ouvrir `arene.html?dev&ws=ws://127.0.0.1:8787`.
