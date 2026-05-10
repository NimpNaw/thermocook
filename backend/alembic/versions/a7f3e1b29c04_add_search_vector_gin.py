"""add search_vector column with GIN index on recipe

Revision ID: a7f3e1b29c04
Revises: 6ccaef225721
Create Date: 2026-04-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a7f3e1b29c04'
down_revision: Union[str, None] = '6ccaef225721'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ajouter la colonne (nullable pour permettre le peuplement en masse)
    op.add_column('recipe', sa.Column('search_vector', sa.dialects.postgresql.TSVECTOR(), nullable=True))

    # 2. Peupler la colonne pour les recettes existantes
    op.execute("""
        UPDATE recipe
        SET search_vector =
            setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('french', coalesce(slug, '')), 'B') ||
            setweight(to_tsvector('french', coalesce(content_md, '')), 'C')
    """)

    # 3. Créer l'index GIN
    op.execute("CREATE INDEX idx_recipe_search_vector ON recipe USING gin (search_vector);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_recipe_search_vector;")
    op.drop_column('recipe', 'search_vector')
