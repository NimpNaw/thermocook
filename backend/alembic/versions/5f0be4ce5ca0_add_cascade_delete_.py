"""add_cascade_delete_shoppinglistexclusion_recipe

Revision ID: 5f0be4ce5ca0
Revises: b5c2d9f3e841
Create Date: 2026-04-19 07:14:34.737192

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '5f0be4ce5ca0'
down_revision: Union[str, None] = 'b5c2d9f3e841'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Supprimer l'ancienne contrainte FK
    op.drop_constraint('shoppinglistexclusion_recipe_id_fkey', 'shoppinglistexclusion', type_='foreignkey')
    # Recréer avec ON DELETE CASCADE
    op.create_foreign_key(
        'shoppinglistexclusion_recipe_id_fkey',
        'shoppinglistexclusion', 'recipe',
        ['recipe_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('shoppinglistexclusion_recipe_id_fkey', 'shoppinglistexclusion', type_='foreignkey')
    op.create_foreign_key(
        'shoppinglistexclusion_recipe_id_fkey',
        'shoppinglistexclusion', 'recipe',
        ['recipe_id'], ['id']
    )
