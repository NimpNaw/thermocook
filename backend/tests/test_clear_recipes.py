"""Tests pour POST /admin/clear-recipes."""
import os
import sys
import pathlib
import tempfile
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_admin_client(mock_session):
    from app.main import app, get_session
    from app.auth import get_current_admin
    from fastapi.testclient import TestClient

    fake_admin = MagicMock()
    fake_admin.is_admin = True

    def override_session():
        yield mock_session

    app.dependency_overrides[get_current_admin] = lambda: fake_admin
    app.dependency_overrides[get_session] = override_session
    return TestClient(app, raise_server_exceptions=False)


def test_clear_recipes_retourne_200_et_nombre_supprime():
    mock_session = MagicMock()
    mock_session.exec.return_value.one.return_value = 42

    client = _make_admin_client(mock_session)
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_thumbs = pathlib.Path(tmpdir) / "thumbs"
        fake_thumbs.mkdir()
        # patch app.thumbs.THUMBS_DIR (pas app.main) car l'endpoint importe THUMBS_DIR
        # localement via `from app.thumbs import THUMBS_DIR` — si cet import est un jour
        # déplacé au niveau module dans main.py, la cible du patch devra changer.
        with patch("app.thumbs.THUMBS_DIR", fake_thumbs):
            try:
                resp = client.post("/admin/clear-recipes")
                assert resp.status_code == 200
                assert resp.json() == {"deleted": 42}
            finally:
                from app.main import app as _app
                _app.dependency_overrides.clear()


def test_clear_recipes_vide_le_repertoire_thumbs():
    mock_session = MagicMock()
    mock_session.exec.return_value.one.return_value = 5

    client = _make_admin_client(mock_session)
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_thumbs = pathlib.Path(tmpdir) / "thumbs"
        fake_thumbs.mkdir()
        (fake_thumbs / "image.webp").write_text("data")
        with patch("app.thumbs.THUMBS_DIR", fake_thumbs):  # voir note dans test_clear_recipes_retourne_200
            try:
                client.post("/admin/clear-recipes")
                assert fake_thumbs.exists()
                assert list(fake_thumbs.iterdir()) == []
            finally:
                from app.main import app as _app
                _app.dependency_overrides.clear()


def test_clear_recipes_necessite_auth_admin():
    from app.main import app
    from fastapi.testclient import TestClient

    app.dependency_overrides.clear()
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post("/admin/clear-recipes")
    assert resp.status_code in (401, 403)
