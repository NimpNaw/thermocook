"""add importlog table

Revision ID: a1b2c3d4e5f6
Revises: 076f84dbd214
Create Date: 2026-04-06 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '076f84dbd214'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'importlog',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('error', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_resolved', sa.Boolean(), nullable=False, server_default='false'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('importlog')
