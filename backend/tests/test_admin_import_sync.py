"""Tests des routes admin d'import de package, de synchronisation et de nettoyage.

Couvre POST /admin/import-package (validations et conflits), les routes
/admin/import-status/*, /admin/sync-catalog (conflits, erreur fatale, log)
et POST /admin/cleanup-images.
"""
import sys
import os
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.import_manager import JobStatus, _jobs  # noqa: E402


@pytest.fixture(autouse=True)
def _isolation():
    """Réinitialise l'état global des jobs et de la synchronisation entre tests."""
    from app.main import _sync_status

    _jobs.clear()
    _sync_status.update({"running": False, "result": None, "processed": 0,
                         "total": 0, "current_recipe": "", "errors": 0, "collector": None})
    yield
    _jobs.clear()
    _sync_status.update({"running": False, "result": None, "processed": 0,
                         "total": 0, "current_recipe": "", "errors": 0, "collector": None})
    from app.main import app
    app.dependency_overrides.clear()


def _make_admin_client():
    from app.main import app
    from app.auth import get_current_admin

    app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(id=1, is_admin=True)
    return TestClient(app, raise_server_exceptions=False)


# ── POST /admin/import-package ───────────────────────────────────────────────

def test_import_package_source_invalide_400():
    client = _make_admin_client()
    resp = client.post("/admin/import-package", json={"source": "ftp", "value": "x"})
    assert resp.status_code == 400
    assert "source doit être" in resp.json()["detail"]


def test_import_package_chemin_inexistant_400():
    client = _make_admin_client()
    resp = client.post("/admin/import-package", json={"source": "path", "value": "/nulle/part.tar.gz"})
    assert resp.status_code == 400
    assert "introuvable" in resp.json()["detail"]


def test_import_package_refuse_pendant_une_synchronisation():
    from app.main import _sync_status

    _sync_status["running"] = True
    client = _make_admin_client()
    resp = client.post("/admin/import-package", json={"source": "url", "value": "https://x/pkg.tar.gz"})
    assert resp.status_code == 409
    assert "synchronisation" in resp.json()["detail"]


def test_import_package_refuse_un_import_concurrent():
    _jobs["job-actif"] = JobStatus(status="downloading")
    client = _make_admin_client()
    with patch("app.main.start_import_job", side_effect=RuntimeError("job_already_running")):
        resp = client.post("/admin/import-package", json={"source": "url", "value": "https://x/pkg.tar.gz"})
    assert resp.status_code == 409
    assert "déjà en cours" in resp.json()["detail"]


def test_import_package_demarre_le_job():
    client = _make_admin_client()
    with patch("app.main.start_import_job", return_value="job-42") as mock_start:
        resp = client.post("/admin/import-package", json={"source": "url", "value": "https://x/pkg.tar.gz"})
    assert resp.status_code == 202
    assert resp.json() == {"job_id": "job-42"}
    mock_start.assert_called_once_with("url", "https://x/pkg.tar.gz")


# ── GET /admin/import-status/* ───────────────────────────────────────────────

def test_import_status_active_sans_job_404():
    client = _make_admin_client()
    resp = client.get("/admin/import-status/active")
    assert resp.status_code == 404


def test_import_status_active_retourne_le_job_en_cours():
    job = JobStatus(status="importing", progress=75, message="Synchronisation : 3 / 4 recettes")
    _jobs["job-actif"] = job
    client = _make_admin_client()
    resp = client.get("/admin/import-status/active")
    assert resp.status_code == 200
    body = resp.json()
    assert body["job_id"] == "job-actif"
    assert body["status"] == "importing"
    assert body["progress"] == 75


def test_import_status_job_inconnu_404():
    client = _make_admin_client()
    resp = client.get("/admin/import-status/job-inconnu")
    assert resp.status_code == 404


def test_import_status_retourne_l_etat_du_job():
    job = JobStatus(status="done", progress=100, message="Terminé : +2 ajout(s), 0 màj, 0 suppression(s)")
    job.errors = ["recette X : image manquante"]
    _jobs["job-fini"] = job
    client = _make_admin_client()
    resp = client.get("/admin/import-status/job-fini")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "done"
    assert body["progress"] == 100
    assert body["errors"] == ["recette X : image manquante"]


def test_import_log_job_inconnu_retourne_message_explicatif():
    client = _make_admin_client()
    resp = client.get("/admin/import-status/job-disparu/log")
    assert resp.status_code == 200
    assert "introuvable" in resp.text
    assert "attachment" in resp.headers["content-disposition"]


def test_import_log_retourne_les_lignes_du_collector():
    job = JobStatus(status="done")
    job.collector.log("Import démarré")
    job.collector.log("Import terminé")
    _jobs["job-log"] = job
    client = _make_admin_client()
    resp = client.get("/admin/import-status/job-log/log")
    assert resp.status_code == 200
    assert "Import démarré" in resp.text
    assert "Import terminé" in resp.text
    assert resp.headers["content-type"].startswith("text/plain")


# ── /admin/sync-catalog ──────────────────────────────────────────────────────

def test_sync_catalog_refuse_si_deja_en_cours():
    from app.main import _sync_status

    _sync_status["running"] = True
    client = _make_admin_client()
    resp = client.post("/admin/sync-catalog")
    assert resp.status_code == 409
    assert "déjà en cours" in resp.json()["detail"]


def test_sync_catalog_refuse_si_import_de_package_actif():
    _jobs["job-actif"] = JobStatus(status="extracting")
    client = _make_admin_client()
    resp = client.post("/admin/sync-catalog")
    assert resp.status_code == 409
    assert "import de package" in resp.json()["detail"]


def _wait_sync_done(timeout=3.0):
    from app.main import _sync_status
    deadline = time.time() + timeout
    while _sync_status["running"] and time.time() < deadline:
        time.sleep(0.02)
    assert not _sync_status["running"], "la synchronisation aurait dû se terminer"


def test_sync_catalog_erreur_fatale_enregistree_dans_le_resultat():
    from app.main import _sync_status

    mock_ir = MagicMock()
    mock_ir.run_sync.side_effect = RuntimeError("disque plein")
    client = _make_admin_client()

    with patch.dict(sys.modules, {"import_recipes": mock_ir}):
        resp = client.post("/admin/sync-catalog")
        assert resp.status_code == 202
        _wait_sync_done()

    assert _sync_status["result"] == {"status": "error", "message": "disque plein"}
    assert any("disque plein" in line for line in _sync_status["collector"].lines)


def test_sync_log_sans_synchronisation_message_par_defaut():
    client = _make_admin_client()
    resp = client.get("/admin/sync-catalog/log")
    assert resp.status_code == 200
    assert "Aucune synchronisation" in resp.text


def test_sync_log_retourne_les_lignes_du_collector():
    from app.import_manager import LogCollector
    from app.main import _sync_status

    collector = LogCollector()
    collector.log("Synchronisation démarrée")
    collector.log("42 recettes traitées")
    _sync_status["collector"] = collector

    client = _make_admin_client()
    resp = client.get("/admin/sync-catalog/log")
    assert resp.status_code == 200
    assert "42 recettes traitées" in resp.text
    assert "attachment" in resp.headers["content-disposition"]


# ── POST /admin/cleanup-images ───────────────────────────────────────────────

def test_cleanup_images_sans_dossier_thumbs(tmp_path):
    client = _make_admin_client()
    with patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs-inexistant"), \
         patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"):
        resp = client.post("/admin/cleanup-images")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 0}


def test_cleanup_images_supprime_les_miniatures_orphelines(tmp_path):
    recipes = tmp_path / "recipes"
    thumbs = tmp_path / "thumbs"
    # Recette encore présente sur disque
    (recipes / "src" / "valide_r1").mkdir(parents=True)
    (thumbs / "thumb" / "src" / "valide_r1").mkdir(parents=True)
    (thumbs / "thumb" / "src" / "valide_r1" / "img.jpg.webp").write_bytes(b"webp")
    # Recette supprimée : sa miniature est orpheline
    (thumbs / "thumb" / "src" / "orpheline_r9").mkdir(parents=True)
    (thumbs / "thumb" / "src" / "orpheline_r9" / "img.jpg.webp").write_bytes(b"webp")
    # Fichier parasite à la racine du cache : ignoré sans erreur
    (thumbs / "fichier-egare.txt").write_text("x")

    client = _make_admin_client()
    with patch("app.thumbs.THUMBS_DIR", thumbs), \
         patch("app.thumbs.RECIPES_DIR", recipes):
        resp = client.post("/admin/cleanup-images")

    assert resp.status_code == 200
    assert resp.json() == {"deleted": 1}
    assert not (thumbs / "thumb" / "src" / "orpheline_r9").exists()
    assert (thumbs / "thumb" / "src" / "valide_r1" / "img.jpg.webp").exists()
