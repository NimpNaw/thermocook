"""cleanup orphaned ingredientref with split accents

Revision ID: 6301267b1a71
Revises: fece90130588
Create Date: 2026-04-05 08:32:33.789592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '6301267b1a71'
down_revision: Union[str, None] = 'fece90130588'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Supprimer les IngredientRef orphelins (sans RecipeIngredient) dont le nom
    # se termine par " [lettre]" — artefact d'encodage des anciens imports
    # (ex: "Banan e", "Tomates ceris e", "Bouquet de persil frai s").
    # Ces entrées ne sont plus liées à aucune recette.
    op.execute("""
        DELETE FROM ingredientref
        WHERE name ~ ' [a-z]$'
        AND id NOT IN (SELECT DISTINCT ingredient_ref_id FROM recipeingredient)
    """)


def downgrade() -> None:
    pass
