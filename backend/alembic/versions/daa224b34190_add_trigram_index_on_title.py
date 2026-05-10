"""add trigram index on title

Revision ID: daa224b34190
Revises: 1b031ab95be7
Create Date: 2026-04-08 22:19:35.280972

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'daa224b34190'
down_revision: Union[str, None] = '1b031ab95be7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_recipe_title_trgm ON recipe USING gin (title gin_trgm_ops);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_recipe_title_trgm;")
