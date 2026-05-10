# 🏗️ Architecture Technique

> **But :** Description de la structure technique "froide" et de l'infrastructure du projet.
> **Contenu :** Stack technique détaillée, schéma de l'infrastructure, variables d'environnement et structure des données (fichiers, base de données).

## Vision de l'Infrastructure
ThermoCook est conçu comme une application conteneurisée, modulaire et auto-hébergée. L'architecture repose sur une séparation claire entre le stockage des données (PostgreSQL), la logique métier (FastAPI) et l'interface utilisateur (React).

---

## 🛠️ Stack Technique

### Backend
- **Langage** : Python 3.11-slim — Gère la logique métier, le traitement des données et l'importation.
- **Framework API** : FastAPI (Asynchrone) — Fournit une API REST haute performance, auto-documentée (Swagger).
- **Pagination** : Support universel de `offset` et `limit` sur tous les endpoints de listage et recherche pour permettre le défilement infini côté frontend.
- **Authentification** : JWT transmis via **HTTP-only Cookies** (`access_token`) — Sécurise l'accès aux données utilisateur en protégeant contre les attaques XSS.
- **ORM / Modélisation** : SQLModel — Combine SQLAlchemy et Pydantic pour une interaction simplifiée et typée avec la base de données.
- **Migrations** : Alembic — Gère l'évolution du schéma de la base de données de manière versionnée.
- **Sécurité** : slowapi — Protège les endpoints sensibles (login/register) contre les attaques par force brute (Rate Limiting).

### Base de Données
- **Moteur** : PostgreSQL 15-alpine — Stocke de manière persistante les recettes, utilisateurs, favoris, etc.
- **Recherche** : Full-Text Search (FTS) native combinée à une extension **Trigramme (`pg_trgm`)** — Permet des recherches floues ultra-rapides sur les titres et le contenu Markdown.
- **Tables clés** :
...
### Frontend
- **Framework** : React 19 + TypeScript.
- **Gestion d'état** : **Zustand** — Store léger pour l'état global (recherche, session).
- **Data Fetching** : **TanStack Query (React Query)** — Gestion du cache, des mutations et des états de chargement asynchrones.
- **Architecture** : **App Shell** — Verrouillage du scroll global du navigateur au profit d'un scroll interne (`overflow-y: auto`), garantissant une barre de navigation (`BottomNav`) parfaitement immobile sur mobile.
- **Build Tool** : Vite 6.
- **Style** : Tailwind CSS v4.
- **PWA** : Vite PWA Plugin — Permet l'installation de l'app sur mobile et le support hors-ligne partiel.
- **Wake Lock API** : Maintient l'écran allumé pendant la lecture d'une recette en mode cuisine.

### Proxy & Serveur Web
- **Serveur** : Nginx — Agit comme point d'entrée unique, gère le SSL (en prod), le reverse proxy vers l'API et sert les fichiers statiques.
- **Rôle** : Performance — Optimise la distribution des images et des miniatures via un cache agressif.

---

## 🏗️ Infrastructure de Données

### Stockage des Recettes
Les recettes sont stockées sous forme de fichiers Markdown dans `data/recipes/`. Chaque dossier de recette contient :
- `recette.md` : Contenu de la recette (titre, ingrédients, étapes).
- `images/` : Photos de la recette.
- `metadata.json` : (Optionnel) Données techniques supplémentaires. *Voir la spécification [RECIPE_FORMAT.md](spec/RECIPE_FORMAT.md).*

### Système de Miniatures (`/thumbs`)
- **Cache** : Stockage des miniatures WebP dans `data/thumbs/` pour éviter la re-génération.
- **Pillow** : Utilisé pour redimensionner les images et extraire la couleur dominante lors de la première génération d'une miniature.
- **Couleur Dominante** : Stockée dans le champ `Recipe.dominant_color` en base pour un affichage optimisé côté frontend.

---

## 🌐 Configuration (Variables d'Environnement)

| Variable | Défaut | Description |
|---|---|---|
| `POSTGRES_USER` | — | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | — | Mot de passe PostgreSQL |
| `POSTGRES_DB` | — | Nom de la base de données |
| `POSTGRES_HOST` | `db` | Hôte de la base de données |
| `SECRET_KEY` | ⚠️ valeur dev | Clé secrète JWT — **à changer en production** |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Origines CORS autorisées (séparées par `,`) |
| `ADMIN_USERNAME` | `admin` | Nom d'utilisateur du compte administrateur |
| `ADMIN_PASSWORD` | `changeme` | Mot de passe admin — **à changer en production** |
| `AUTO_IMPORT` | `true` | Lance `import_recipes.py` au démarrage du backend |
| `COOKIE_SECURE` | `false` | Cookie JWT Secure (HTTPS uniquement) |
| `BACKEND_PORT` | `8000` | Port exposé du backend |
| `FRONTEND_PORT` | `3000` | Port exposé du frontend |
| `OUTPUT_DIR` | `/app/data/recipes` | Répertoire des recettes importées |
