"""cleanup dirty ingredientref entries

Revision ID: fece90130588
Revises: 9549c007592f
Create Date: 2026-04-05 08:29:25.708978

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'fece90130588'
down_revision: Union[str, None] = '9549c007592f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DIRTY_SLUG_PATTERN = r'^(g|ml|cl|dl|kg|gr|cs|cc|c-a-soupe|c-a-cafe|pincee|pincees|gousse|gousses|sachet|sachets|tranche|tranches|feuille|feuilles|branche|branches)-de-'


def upgrade() -> None:
    # Supprimer les RecipeIngredient liés aux IngredientRef dont le slug
    # commence par une unité (ex: "g-de-beurre", "pincee-de-sel").
    # Ces entrées ont qty=0 car parse_quantity_and_unit échouait à extraire
    # le nombre, laissant toute la chaîne "g de beurre" comme nom d'ingrédient.
    op.execute(f"""
        DELETE FROM recipeingredient
        WHERE ingredient_ref_id IN (
            SELECT id FROM ingredientref
            WHERE slug ~ '{DIRTY_SLUG_PATTERN}'
        )
    """)
    op.execute(f"""
        DELETE FROM ingredientref
        WHERE slug ~ '{DIRTY_SLUG_PATTERN}'
    """)


def downgrade() -> None:
    # Les données supprimées sont reconstruites par un ré-import (import_recipes.py).
    pass
