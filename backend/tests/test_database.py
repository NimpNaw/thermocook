"""Tests unitaires pour init_db() — logique stamp vs upgrade Alembic."""
import os
import sys
from unittest.mock import MagicMock, patch


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SECRET_KEY", "test-secret-key")


import app.database as db_module  # noqa: E402


def test_init_db_stamps_when_schema_exists_without_alembic_version():
    """Tables présentes mais pas alembic_version → stamp (prod pré-Alembic)."""
    mock_inspector = MagicMock()
    mock_inspector.get_table_names.return_value = [
        "user", "recipe", "mealplan", "userfavorite",
        "userrecipenote", "recipeingredient", "ingredientref", "pendingpackage",
    ]

    with patch("app.database.inspect", return_value=mock_inspector), \
         patch("app.database.command") as mock_command, \
         patch("app.database.Session"), \
         patch("app.database._seed_admin"):
        db_module.init_db()

    mock_command.stamp.assert_called_once()
    assert mock_command.stamp.call_args[0][1] == "head"
    mock_command.upgrade.assert_not_called()


def test_init_db_upgrades_on_fresh_install():
    """DB vide → upgrade head."""
    mock_inspector = MagicMock()
    mock_inspector.get_table_names.return_value = []

    with patch("app.database.inspect", return_value=mock_inspector), \
         patch("app.database.command") as mock_command, \
         patch("app.database.Session"), \
         patch("app.database._seed_admin"):
        db_module.init_db()

    mock_command.upgrade.assert_called_once()
    assert mock_command.upgrade.call_args[0][1] == "head"
    mock_command.stamp.assert_not_called()


def test_init_db_upgrades_when_alembic_version_exists():
    """alembic_version présente → upgrade head (migrations incrémentales normales)."""
    mock_inspector = MagicMock()
    mock_inspector.get_table_names.return_value = [
        "user", "recipe", "alembic_version",
    ]

    with patch("app.database.inspect", return_value=mock_inspector), \
         patch("app.database.command") as mock_command, \
         patch("app.database.Session"), \
         patch("app.database._seed_admin"):
        db_module.init_db()

    mock_command.upgrade.assert_called_once()
    assert mock_command.upgrade.call_args[0][1] == "head"
    mock_command.stamp.assert_not_called()
