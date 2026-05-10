"""add_trigram_index_on_title

Revision ID: 02e50dbd4ba7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-08 11:09:02.169530

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '02e50dbd4ba7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Activer l'extension pg_trgm pour la recherche floue performante
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    # Créer un index GIN utilisant les trigrammes sur la colonne titre
    op.execute("CREATE INDEX idx_recipe_title_trgm ON recipe USING gin (title gin_trgm_ops);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_recipe_title_trgm;")
    # On ne drop pas l'extension au cas où d'autres en dépendent
