"""cleanup remaining orphaned dirty ingredientrefs

Revision ID: 870c9a138f6c
Revises: 6301267b1a71
Create Date: 2026-04-05 08:34:03.438124

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '870c9a138f6c'
down_revision: Union[str, None] = '6301267b1a71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Supprimer les IngredientRef orphelins (sans RecipeIngredient) qui ont
    # des artefacts résiduels : accents splittés, parenthèses fermantes, préfixes d'unité sans "de".
    op.execute("""
        DELETE FROM ingredientref
        WHERE id NOT IN (SELECT DISTINCT ingredient_ref_id FROM recipeingredient)
        AND (
            name ~ ' [^a-zA-Z0-9 ,().]'
            OR name LIKE '%)'
            OR (slug ~ '^(g|ml|cl)-[a-z]' AND slug !~ '^(g|ml|cl)-de-')
        )
    """)


def downgrade() -> None:
    pass
