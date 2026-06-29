# Fromagerie App

Application de gestion des commandes (Gmail → PDF → base → carnet de préparation iPad),
en Vue 3 + Express/Node.js + MySQL, déployée sur Railway.

## Structure

```
backend/    API Express, migrations Knex, accès MySQL, futur module Gmail/parsing PDF
frontend/   Vue 3 + Vite (carnet du jour, historique commandes, référentiels, paramètres)
```

Le frontend est buildé puis copié dans `backend/src/public/` ; un seul process Node sert
à la fois l'API et les pages — un seul service à déployer sur Railway.

Détail du schéma de base : voir `backend/README-schema.md`.

## Démarrage en développement

Terminal 1 — backend :
```bash
cd backend
npm install
cp .env.example .env   # renseigner MYSQL_URL (Railway ou base locale)
npm run migrate
npm run seed
npm run dev             # http://localhost:3000
```

Terminal 2 — frontend :
```bash
cd frontend
npm install
npm run dev              # http://localhost:5173, proxy /api -> localhost:3000
```

## Build pour la prod

```bash
cd frontend
npm run build             # sort directement dans backend/src/public
cd ../backend
npm start                  # sert l'API + le build sur un seul port
```

## État actuel des briques

| Brique | État |
|---|---|
| Schéma DB + migrations | ✅ fait et testé |
| Scaffold backend (Express, routes stub) + frontend (Vue/Vite) | ✅ fait et testé |
| Script d'import du référentiel CSV | ⬜ à faire |
| Module Gmail (récupération mails du label) | ⬜ à faire |
| CRUD commandes / RUD référentiels — implémentation complète | ⬜ stubs posés, logique à affiner |
| Carnet de commandes — design complet repris de la maquette HTML | ⬜ stub fonctionnel posé |

## IntelliJ

Ouvrir le dossier racine `fromagerie-app/` comme projet — IntelliJ détecte les deux
`package.json` (backend et frontend) et propose l'onglet npm pour chacun.
Créer deux Run Configurations (npm run dev) avec working dir respectif.
