"""add_unique_index_userrecipenote_user_recipe

Revision ID: b5c2d9f3e841
Revises: a7f3e1b29c04
Create Date: 2026-04-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'b5c2d9f3e841'
down_revision: Union[str, None] = 'a7f3e1b29c04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_userrecipenote_user_recipe",
        "userrecipenote",
        ["user_id", "recipe_id"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_userrecipenote_user_recipe",
        "userrecipenote",
        type_="unique"
    )
