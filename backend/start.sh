#!/bin/bash
set -e

# Si on tourne en root (premier démarrage du conteneur), on s'assure que le
# volume monté sur /app/data appartient à l'utilisateur applicatif, puis on
# ré-exécute ce script en tant que `thermo` (UID 1000). Cela évite à
# l'utilisateur final de devoir `chown` le dossier ./data sur l'hôte.
if [ "$(id -u)" = "0" ]; then
  echo "🔧 Configuration des permissions sur /app/data..."
  mkdir -p /app/data/recipes /app/data/thumbs
  chown -R thermo:thermo /app/data
  exec gosu thermo "$0" "$@"
fi

# Attente de la base de données
echo "⏳ Attente de la base de données PostgreSQL..."
while ! nc -z db 5432; do
  sleep 0.1
done
echo "Connection to db succeeded!"

# Création des dossiers de données pour éviter le crash de StaticFiles
# (en mode dev / venv local, on n'est pas passé par la branche root ci-dessus)
echo "📁 Création des dossiers de données..."
mkdir -p data/recipes data/thumbs

# Application des migrations Alembic
echo "🗄️  Application des migrations Alembic..."
alembic upgrade head

# Lancement de l'importation en arrière-plan si demandé
# L'API démarre immédiatement ; l'import tourne en parallèle sans bloquer le healthcheck.
if [ "$AUTO_IMPORT" = "true" ]; then
    echo "✅ Lancement de l'importation automatique en arrière-plan..."
    # On lance l'import en tâche de fond, les logs iront dans la sortie standard du conteneur
    python import_recipes.py &
else
    echo "⏩ Saut de l'importation automatique (AUTO_IMPORT n'est pas à true)."
fi

# Démarrage de l'API
echo "🚀 Démarrage de l'API ThermoCook..."
uvicorn app.main:app --host 0.0.0.0 --port 8000
