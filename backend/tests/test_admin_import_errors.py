"""Tests d'intégration des routes admin d'erreurs d'import et d'alertes (FK réelles).

Couvre GET /admin/import-errors, POST /admin/import-errors/{id}/resolve
et GET /admin/alerts.
"""
import sys
import os
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlmodel import Session

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import ImportLog  # noqa: E402


def _make_admin_client(fk_engine):
    from app.main import app, get_session
    from app.auth import get_current_admin

    def override_session():
        with Session(fk_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(id=1, is_admin=True)
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


def test_get_import_errors_retourne_les_logs_recents(fk_engine, fk_session):
    ancien = ImportLog(source="http://a/pkg.tar.gz", error="timeout",
                       created_at=datetime(2024, 1, 1, tzinfo=timezone.utc))
    recent = ImportLog(source="/tmp/pkg.zip", error="archive corrompue",
                       created_at=datetime(2025, 6, 1, tzinfo=timezone.utc), is_resolved=True)
    fk_session.add(ancien)
    fk_session.add(recent)
    fk_session.commit()

    client = _make_admin_client(fk_engine)
    try:
        resp = client.get("/admin/import-errors")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Tri du plus récent au plus ancien
        assert data[0]["source"] == "/tmp/pkg.zip"
        assert data[0]["error"] == "archive corrompue"
        assert data[0]["is_resolved"] is True
        assert data[1]["source"] == "http://a/pkg.tar.gz"
        assert data[1]["is_resolved"] is False
        assert "created_at" in data[0]
    finally:
        _cleanup()


def test_get_import_errors_vide(fk_engine):
    client = _make_admin_client(fk_engine)
    try:
        resp = client.get("/admin/import-errors")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        _cleanup()


def test_resolve_import_error_marque_resolue(fk_engine, fk_session):
    log = ImportLog(source="/tmp/pkg.zip", error="boom")
    fk_session.add(log)
    fk_session.commit()
    fk_session.refresh(log)
    log_id = log.id
    fk_session.commit()  # referme la transaction ouverte par le refresh (StaticPool)

    client = _make_admin_client(fk_engine)
    try:
        resp = client.post(f"/admin/import-errors/{log_id}/resolve")
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}
    finally:
        _cleanup()

    fk_session.expire_all()
    assert fk_session.get(ImportLog, log_id).is_resolved is True


def test_resolve_import_error_inconnue_404(fk_engine):
    client = _make_admin_client(fk_engine)
    try:
        resp = client.post("/admin/import-errors/9999/resolve")
        assert resp.status_code == 404
    finally:
        _cleanup()


def test_admin_alerts_compte_les_erreurs_non_resolues(fk_engine, fk_session):
    fk_session.add(ImportLog(source="a", error="e1"))
    fk_session.add(ImportLog(source="b", error="e2"))
    fk_session.add(ImportLog(source="c", error="e3", is_resolved=True))
    fk_session.commit()

    client = _make_admin_client(fk_engine)
    try:
        resp = client.get("/admin/alerts")
        assert resp.status_code == 200
        assert resp.json() == {"unresolved_errors": 2}
    finally:
        _cleanup()
