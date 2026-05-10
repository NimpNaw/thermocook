"""remove redundant ingredients_json column

Revision ID: 173ea7eb6400
Revises: daa224b34190
Create Date: 2026-04-09 00:20:09.228763

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = '173ea7eb6400'
down_revision: Union[str, None] = 'daa224b34190'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('recipe', 'ingredients_json')


def downgrade() -> None:
    op.add_column('recipe', sa.Column('ingredients_json', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True))
