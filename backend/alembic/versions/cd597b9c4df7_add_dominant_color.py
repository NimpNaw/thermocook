"""add_dominant_color

Revision ID: cd597b9c4df7
Revises: 299f80315aad
Create Date: 2026-04-04 18:08:15.296968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'cd597b9c4df7'
down_revision: Union[str, None] = '299f80315aad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recipe', sa.Column('dominant_color', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('recipe', 'dominant_color')
