"""Tests d'intégration pour les endpoints /login et /logout (cookie HttpOnly)."""
import sys
import os
from datetime import datetime
from unittest.mock import MagicMock, patch


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _FakeUser:
    """User minimal compatible avec Pydantic UserResponse (from_attributes=True)."""
    id = 1
    username = "alice"
    is_active = True
    is_admin = False
    created_at = datetime(2024, 1, 1)
    hashed_password = "hashed_secret"


def _make_client(fake_user=None, password_ok=True):
    """Crée un TestClient avec session mockée."""
    from app.main import app, get_session
    from fastapi.testclient import TestClient

    mock_session = MagicMock()
    if fake_user is not None:
        mock_session.exec.return_value.first.return_value = fake_user

    def override():
        yield mock_session

    app.dependency_overrides[get_session] = override

    patcher = patch("app.main.verify_password", return_value=password_ok)
    patcher.start()

    client = TestClient(app, raise_server_exceptions=False)
    return client, patcher


def test_login_returns_200_and_sets_cookie():
    """POST /login → 200 + cookie access_token HttpOnly."""
    client, patcher = _make_client(fake_user=_FakeUser(), password_ok=True)
    try:
        resp = client.post("/login", data={"username": "alice", "password": "secret"})
        assert resp.status_code == 200
        assert "access_token" in resp.cookies
        assert "httponly" in resp.headers.get("set-cookie", "").lower()
    finally:
        from app.main import app
        app.dependency_overrides.clear()
        patcher.stop()


def test_login_returns_user_info():
    """POST /login → body contient id, username, is_admin."""
    client, patcher = _make_client(fake_user=_FakeUser(), password_ok=True)
    try:
        resp = client.post("/login", data={"username": "alice", "password": "secret"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "alice"
        assert "id" in body
        assert "access_token" not in body  # le token ne doit plus être dans le body
    finally:
        from app.main import app
        app.dependency_overrides.clear()
        patcher.stop()


def test_login_wrong_password_returns_401():
    """POST /login avec mauvais mot de passe → 401."""
    client, patcher = _make_client(fake_user=_FakeUser(), password_ok=False)
    try:
        resp = client.post("/login", data={"username": "alice", "password": "wrong"})
        assert resp.status_code == 401
    finally:
        from app.main import app
        app.dependency_overrides.clear()
        patcher.stop()


def test_logout_clears_cookie():
    """POST /logout → cookie access_token expiré (max-age=0 ou expires passé)."""
    from app.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post("/logout")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    set_cookie = resp.headers.get("set-cookie", "")
    # Le cookie doit être effacé (max-age=0 ou expires dans le passé)
    assert "access_token" in set_cookie
    assert "max-age=0" in set_cookie.lower() or "expires" in set_cookie.lower()


# ── sync progress ───────────────────────────────────────────────────────────

def test_sync_status_exposes_progress():
    """Le status retourne processed/total pendant l'exécution."""
    from app.main import app, _sync_status
    from fastapi.testclient import TestClient
    from app.auth import get_current_admin

    fake_admin = MagicMock()
    fake_admin.is_admin = True
    app.dependency_overrides[get_current_admin] = lambda: fake_admin

    # Injecter manuellement un état intermédiaire
    _sync_status["running"] = True
    _sync_status["processed"] = 150
    _sync_status["total"] = 500
    _sync_status["result"] = None

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/admin/sync-catalog/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["running"] is True
    assert data["processed"] == 150
    assert data["total"] == 500

    # Nettoyage
    _sync_status["running"] = False
    _sync_status["processed"] = 0
    _sync_status["total"] = 0
    app.dependency_overrides.clear()


def test_sync_callback_updates_status():
    """run_sync() est bien appelé avec un progress_callback qui met à jour _sync_status."""
    import sys
    import time
    from app.main import _sync_status, app
    from app.auth import get_current_admin
    from fastapi.testclient import TestClient

    captured = {}

    def fake_run_sync(progress_callback=None, log_fn=None):
        if progress_callback:
            progress_callback(100, 200, "recette_test", 0)
            captured["processed"] = _sync_status.get("processed")
            captured["total"] = _sync_status.get("total")
        return {"added": 0, "updated": 0, "deleted": 0, "errors": 0, "error_details": []}

    mock_ir = MagicMock()
    mock_ir.run_sync.side_effect = fake_run_sync

    fake_admin = MagicMock()
    fake_admin.is_admin = True
    app.dependency_overrides[get_current_admin] = lambda: fake_admin

    from app import import_manager
    import_manager._jobs.clear()  # isolation : éviter le 409 dû à des jobs résiduels

    with patch.dict(sys.modules, {"import_recipes": mock_ir}):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/admin/sync-catalog")
        assert resp.status_code == 202
        time.sleep(0.3)  # laisser le thread terminer
        assert captured.get("processed") == 100
        assert captured.get("total") == 200

    app.dependency_overrides.clear()
