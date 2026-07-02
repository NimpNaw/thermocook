"""Tests du lifespan FastAPI : vérification d'intégrité des ingrédients au démarrage."""
import sys
import os
import time
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import Recipe  # noqa: E402


def _start_app(fk_engine, monkeypatch, mock_ir):
    import app.database as database
    monkeypatch.setattr(database, "engine", fk_engine)

    from app.main import app
    with patch("app.main.init_db") as mock_init, \
         patch.dict(sys.modules, {"import_recipes": mock_ir}):
        with TestClient(app):
            pass
    return mock_init


def test_lifespan_relance_l_import_si_ingredients_manquants(fk_engine, fk_session, monkeypatch):
    """Des recettes sans aucun RecipeIngredient → re-import automatique lancé."""
    fk_session.add(Recipe(id="r1", title="Tarte", slug="tarte", content_md="# Tarte"))
    fk_session.commit()

    mock_ir = MagicMock()
    mock_init = _start_app(fk_engine, monkeypatch, mock_ir)

    mock_init.assert_called_once()
    # Le re-import tourne dans un thread démon : on lui laisse un court délai
    deadline = time.time() + 2.0
    while not mock_ir.run_import.called and time.time() < deadline:
        time.sleep(0.02)
    mock_ir.run_import.assert_called_once()


def test_lifespan_sans_recettes_ne_relance_pas_l_import(fk_engine, monkeypatch):
    """Base vierge (0 recette) : pas de re-import automatique."""
    mock_ir = MagicMock()
    mock_init = _start_app(fk_engine, monkeypatch, mock_ir)

    mock_init.assert_called_once()
    # Test négatif à fenêtre temporelle : un éventuel thread de re-import très
    # lent à démarrer donnerait un faux vert avec une fenêtre trop courte.
    time.sleep(0.3)
    mock_ir.run_import.assert_not_called()
