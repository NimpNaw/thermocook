import os

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlmodel import create_engine, Session, select

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    user = os.getenv("POSTGRES_USER", "thermocook")
    password = os.getenv("POSTGRES_PASSWORD", "thermopassword")
    db = os.getenv("POSTGRES_DB", "thermocook")
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    DATABASE_URL = f"postgresql://{user}:{password}@{host}:{port}/{db}"

engine = create_engine(DATABASE_URL, echo=False)

# Chemin absolu vers alembic.ini, résolu depuis l'emplacement de ce fichier
# backend/app/database.py → backend/alembic.ini
_ALEMBIC_CFG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic.ini"
)


def _seed_admin(session: Session) -> None:
    """Crée (ou met à jour) le compte administrateur depuis les variables d'environnement.

    Le compte est mis à jour à chaque démarrage pour refléter les variables
    ADMIN_USERNAME / ADMIN_PASSWORD courantes.
    """
    from app.models import User  # import local pour éviter la dépendance circulaire
    from app.auth import get_password_hash

    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "changeme")

    existing = session.exec(select(User).where(User.username == admin_username)).first()
    if existing:
        existing.hashed_password = get_password_hash(admin_password)
        existing.is_active = True
        existing.is_admin = True
        session.commit()
        print(f"Compte administrateur '{admin_username}' mis à jour.")
        return

    admin = User(
        username=admin_username,
        hashed_password=get_password_hash(admin_password),
        is_active=True,
        is_admin=True,
    )
    session.add(admin)
    session.commit()
    print(f"Compte administrateur '{admin_username}' créé.")


def init_db() -> None:
    """Applique les migrations Alembic et initialise le compte admin.

    Logique de démarrage :
    - Si les tables existent mais pas alembic_version : prod pré-Alembic → stamp head
      (marque la DB comme à jour sans toucher aux données)
    - Sinon : upgrade head (applique les migrations manquantes ou crée les tables)
    """
    alembic_cfg = Config(_ALEMBIC_CFG_PATH)
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if "user" in tables and "alembic_version" not in tables:
        print("DB existante détectée sans alembic_version — stamp à head.")
        command.stamp(alembic_cfg, "head")
    else:
        command.upgrade(alembic_cfg, "head")

    with Session(engine) as session:
        _seed_admin(session)


def get_session():
    with Session(engine) as session:
        yield session

def purge_db():
    from app.models import (
        Recipe,
        IngredientRef,
        UserFavorite,
        UserRecipeNote,
        MealPlan,
        RecipeIngredient,
        ShoppingListExclusion,
    )
    from sqlalchemy import delete
    with Session(engine) as session:
        session.exec(delete(ShoppingListExclusion))
        session.exec(delete(UserRecipeNote))
        session.exec(delete(MealPlan))
        session.exec(delete(UserFavorite))
        session.exec(delete(RecipeIngredient))
        session.exec(delete(Recipe))
        session.exec(delete(IngredientRef))
        session.commit()
