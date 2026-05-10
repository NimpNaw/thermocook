FROM python:3.11-slim

WORKDIR /app

# Installation des dépendances système :
#  - netcat : attente de la DB
#  - gosu   : drop de privilèges (root → thermo) après chown du volume
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    netcat-openbsd \
    gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code backend
COPY . .

RUN chmod +x start.sh

# Création de l'utilisateur applicatif (UID 1000). On NE bascule PAS vers
# cet utilisateur via `USER thermo` : start.sh démarre en root pour pouvoir
# `chown` le volume monté sur /app/data (souvent créé en root par Docker
# lors du premier `up`), puis ré-exécute via `gosu thermo`.
RUN useradd -m -u 1000 thermo && chown -R thermo:thermo /app

# L'API s'expose sur le port 8000
EXPOSE 8000

CMD ["./start.sh"]
