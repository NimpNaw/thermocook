"""add trigram index on content_md

Revision ID: 6ccaef225721
Revises: 173ea7eb6400
Create Date: 2026-04-09 10:58:47.107945

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '6ccaef225721'
down_revision: Union[str, None] = '173ea7eb6400'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # L'extension pg_trgm est normalement déjà activée par la migration précédente
    op.execute("CREATE INDEX idx_recipe_content_trgm ON recipe USING gin (content_md gin_trgm_ops);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_recipe_content_trgm;")
