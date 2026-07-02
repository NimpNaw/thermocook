# 🛣️ Workflow & Développement

> **But :** Guide opérationnel sur la manière de développer, tester et déployer le projet.
> **Contenu :** Guide de développement local, fonctionnement de la CI/CD (GitHub Actions), processus de déploiement et conventions de code/conception.

Ce document décrit les processus de développement, les cycles de déploiement et les conventions à respecter sur le projet ThermoCook.

---

## 🔄 Cycle de Vie d'une Tâche

Toute modification du projet suit un processus rigoureux adapté à l'envergure de la tâche.

### 1. Sélection & Cadrage
- **Choix du Todo** : Sélectionner une tâche dans `TODO.md`.
- **Classification** :
    - **Tâche Majeure (`[FEAT]`, `[REFACT]`)** : Créer un plan d'action détaillé dans `docs/plans/pending/` avec les **5 sections** (Contexte, Objectifs, Exécution, Validation, Succès).
    - **Tâche Mineure (`[MINOR]`, `[FIX]`)** : Pas de fichier de plan séparé requis. Le plan peut être résumé directement dans la description de la branche/PR.

### 2. Développement & Implémentation
- **Branche Dédiée** : Créer une branche `feat/` ou `fix/` spécifique.
- **Documentation-as-Code** : La documentation associée (spécifications, mémoires) **doit** être mise à jour dans la même branche et incluse dans la PR.
- **Sanity Check Local** : Avant tout push, l'agent doit vérifier :
    - Backend : `ruff check .`
    - Frontend : `npm run lint` (si disponible) ou vérification visuelle des erreurs TypeScript.

### 3. Validation & Revue
- **Pull Request (PR)** : Ouvrir une PR vers `main`.
- **Vérification CI/CD** : Tous les tests unitaires et le pipeline de build doivent être au **vert**.
- **Gestion des Échecs** : En cas d'erreur, analyser les logs, corriger et relancer le cycle.

### 4. Finalisation & Intégrité
Une tâche est considérée comme **close** uniquement lorsque :
1. **Merge** : La PR est fusionnée dans `main`.
2. **Nettoyage** : La branche est supprimée.
3. **Traçabilité** : Le plan est marqué comme exécuté et déplacé dans `docs/plans/history/`.
4. **Mise à jour Todo** : Le fichier `TODO.md` est mis à jour.


---

## 🚀 Guide de Développement Local

### Lancer l'environnement
Utilisez Docker Compose pour démarrer tous les services avec le hot-reload activé :
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Accès aux services
- **Frontend** : [http://localhost:3000](http://localhost:3000)
- **API (Swagger)** : [http://localhost:8000/docs](http://localhost:8000/docs)

### Outils de préparation
Pour extraire des recettes depuis Cookomix (depuis la racine) :
```bash
# Scraping normal (saute les recettes déjà présentes)
scripts/.venv/bin/python3 scripts/cookomix_download.py <URL1> <URL2> ...

# Re-scraping forcé (écrase les recettes existantes)
scripts/.venv/bin/python3 scripts/cookomix_download.py --force <URL1> <URL2> ...

# Re-scraping en masse depuis des fichiers batch
for batch in url_batch_*; do
  scripts/.venv/bin/python3 scripts/cookomix_download.py --force $(cat $batch) --output data/recipes
done
```

---

## 🔄 CI/CD


**Déclencheurs** : push sur `main`/`master` **et pull requests**. Sur une PR, seuls les jobs de test s'exécutent (build/deploy sont réservés aux push sur `main`) — c'est ce qui garantit la règle « CI au vert avant merge » du cycle de vie.

### Versionnement de l'Application
- **CI Gitea (interne)** : le pipeline utilise le tag `:latest` pour les images `backend` et `frontend` poussées sur le registre GHCR. Le déploiement automatique sur l'instance de développement (`deploy-dev`) écrase la version précédente avec le dernier build de `main`.
- **Publication publique (GitHub + ghcr.io)** : les releases semver `vX.Y.Z` sont poussées manuellement via `./scripts/release-public.sh` (miroir `NimpNaw/thermocook` + images `ghcr.io/nimpnaw/thermocook-{backend,frontend}:vX.Y.Z`). Procédure complète : [`docs/RELEASE.md`](RELEASE.md).
- **Note** : Ne pas confondre ces versionnements logiciels avec le **versionnement des recettes** (ex: `v1.0.0`), qui est géré comme un catalogue de données indépendant (voir [`docs/spec/RECIPE_PACKAGING.md`](spec/RECIPE_PACKAGING.md)).

### Jobs du Pipeline
1.  **backend-test** : Linting (Ruff) + tests Pytest avec couverture (`--cov-fail-under=90`).
2.  **frontend-test** : Tests Vitest avec couverture ; les seuils (`test.coverage.thresholds` dans `vite.config.ts` : 70 % statements/lines, 60 % branches) font échouer le job en cas de régression.
3.  **scripts-test** : Tests shell `scripts/lib/test-scrub.sh` et `test-validate.sh`.
4.  **e2e-tests** : Stack Docker isolée + Playwright.
5.  **build-and-push** : Construit et pousse les images Docker (uniquement sur push `main`, si tous les tests passent).
6.  **deploy-dev** : Met à jour l'instance de développement (uniquement sur push `main`).

> ⚠️ **`deploy-dev` et le répertoire de travail** : l'instance dev tourne depuis `/home/fabien/thermocook` (montages `./backend` et `./data` du `docker-compose.dev.yml`). Le job fait `checkout main` + `reset --hard origin/main` dans ce répertoire ; un garde-fou **annule le déploiement** si des modifications non commitées y sont présentes (au lieu de les détruire). Conséquences pratiques : committer/pousser avant chaque merge, et éviter d'y laisser du travail en cours pendant qu'une CI tourne — utiliser un `git worktree` séparé pour les travaux longs.

### Déploiement Production
Le déploiement en production est **intentionnellement manuel** pour garantir un contrôle total.
```bash
docker compose -f docker-compose.yml -p thermocook --project-directory /home/fabien/thermocook up -d --pull always --wait
```

---

## 📏 Conventions du Projet

### Frontend
- **Composants** : Utiliser des composants fonctionnels React avec TypeScript.
- **Style** : Prioriser les classes utilitaires Tailwind CSS.
- **Rendu** : Utiliser le composant `<FormattedText />` pour transformer les tags `[TAG]` en icônes.

### Backend
- **API** : Suivre les principes REST.
- **Migrations** : Toujours utiliser Alembic pour toute modification du schéma de base de données.
  ```bash
  alembic revision --autogenerate -m "description"
  ```
- **Sécurité** : Ne jamais exposer de secrets ou de clés API. Utiliser `ALLOWED_ORIGINS` pour le CORS.
