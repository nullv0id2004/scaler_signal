"""message is_forwarded

Revision ID: a1f2c3d4e5f6
Revises: 8c30a7eccf0f
Create Date: 2026-07-11 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1f2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '8c30a7eccf0f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'is_forwarded',
                sa.Boolean(),
                nullable=False,
                server_default='0',
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_column('is_forwarded')
