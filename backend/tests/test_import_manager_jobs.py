"""Tests du cycle de vie complet des jobs d'import (app/import_manager.py).

Couvre _run_import_job de bout en bout (archive locale réelle), la persistance
des erreurs (_log_import_error, base FK réelle), get_active_job, les protections
Zip Slip / Tar Slip et les erreurs de téléchargement.
"""
import io
import sys
import os
import tarfile
import time
import zipfile
from unittest.mock import MagicMock, patch

import pytest
from sqlmodel import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import import_manager  # noqa: E402
from app.import_manager import (  # noqa: E402
    JobStatus,
    _jobs,
    _run_import_job,
    get_active_job,
)
from app.models import ImportLog  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_jobs():
    _jobs.clear()
    yield
    _jobs.clear()


def _make_targz(path, entries):
    """Crée une archive tar.gz avec `entries` = {chemin: contenu}."""
    with tarfile.open(path, "w:gz") as tar:
        for name, content in entries.items():
            data = content.encode()
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return path


# ── get_active_job ───────────────────────────────────────────────────────────

def test_get_active_job_sans_aucun_job():
    assert get_active_job() is None


def test_get_active_job_retourne_le_job_en_cours():
    _jobs["fini"] = JobStatus(status="done")
    _jobs["actif"] = JobStatus(status="downloading", progress=10)
    job_id, snapshot = get_active_job()
    assert job_id == "actif"
    assert snapshot.status == "downloading"
    # C'est un snapshot : modifier la copie ne touche pas le job réel
    snapshot.progress = 99
    assert _jobs["actif"].progress == 10


def test_get_active_job_retourne_le_dernier_job_termine():
    _jobs["ancien"] = JobStatus(status="done")
    _jobs["dernier"] = JobStatus(status="error", message="boom")
    job_id, snapshot = get_active_job()
    assert job_id == "dernier"
    assert snapshot.status == "error"


# ── _run_import_job : cycle complet avec une archive locale réelle ───────────

def test_run_import_job_complet_depuis_archive_locale(tmp_path):
    """Archive tar.gz valide → extraction dans data/recipes + sync SQL → done."""
    archive = _make_targz(tmp_path / "pkg.tar.gz", {
        "recipes/cookomix/tarte_r123/recette.md": "# Tarte",
        "recipes/cookomix/tarte_r123/images/p.jpg": "fake-img",
    })

    progress_seen = []

    def fake_run_sync(progress_callback=None, log_fn=None):
        # Exercer les deux formes de message d'on_progress
        progress_callback(1, 2, "tarte...", 0)
        progress_seen.append(_jobs["job-1"].message)
        progress_callback(2, 2, "", 0)
        progress_seen.append(_jobs["job-1"].message)
        if log_fn:
            log_fn("Sync SQL OK")
        return {"added": 1, "updated": 0, "deleted": 0, "errors": 0, "error_details": []}

    mock_ir = MagicMock()
    mock_ir.run_sync.side_effect = fake_run_sync

    _jobs["job-1"] = JobStatus()
    with patch("app.import_manager.ROOT", tmp_path), \
         patch.dict(sys.modules, {"import_recipes": mock_ir}):
        _run_import_job("job-1", "path", str(archive))

    job = _jobs["job-1"]
    assert job.status == "done"
    assert job.progress == 100
    assert "+1 ajout(s)" in job.message
    assert job.errors == []
    # Les recettes ont été copiées dans data/recipes
    assert (tmp_path / "data" / "recipes" / "cookomix" / "tarte_r123" / "recette.md").read_text() == "# Tarte"
    # Le dossier temporaire est nettoyé
    assert not (tmp_path / "tmp-import-job-1").exists()
    # on_progress : message détaillé si le libellé se termine par "...", sinon compteur
    assert progress_seen[0] == "tarte..."
    assert progress_seen[1] == "Synchronisation : 2 / 2 recettes"
    # Le log contient les étapes clés
    log_text = job.collector.as_text()
    assert "Import démarré" in log_text
    assert "Sync SQL OK" in log_text


def test_run_import_job_remplace_les_dossiers_existants_et_purge_les_plats(tmp_path):
    """Un dossier destination existant est remplacé, et l'ancien dossier plat
    portant le même ID de recette est supprimé."""
    archive = _make_targz(tmp_path / "pkg.tar.gz", {
        "recipes/cookomix/tarte_r123/recette.md": "# Version 2",
    })
    dest = tmp_path / "data" / "recipes"
    # Ancienne arborescence : dossier source existant + dossier plat hérité
    (dest / "cookomix" / "tarte_r123").mkdir(parents=True)
    (dest / "cookomix" / "tarte_r123" / "recette.md").write_text("# Version 1")
    (dest / "vieille-tarte_r123").mkdir(parents=True)

    mock_ir = MagicMock()
    mock_ir.run_sync.return_value = {"added": 0, "updated": 1, "deleted": 0, "errors": 0, "error_details": []}

    _jobs["job-2"] = JobStatus()
    with patch("app.import_manager.ROOT", tmp_path), \
         patch.dict(sys.modules, {"import_recipes": mock_ir}):
        _run_import_job("job-2", "path", str(archive))

    assert _jobs["job-2"].status == "done"
    assert (dest / "cookomix" / "tarte_r123" / "recette.md").read_text() == "# Version 2"
    assert not (dest / "vieille-tarte_r123").exists()  # dossier plat purgé


def test_run_import_job_archive_introuvable_persiste_l_erreur(tmp_path, fk_engine, monkeypatch):
    """Échec (archive absente) → job en erreur + ImportLog écrit en base."""
    import app.database as database
    monkeypatch.setattr(database, "engine", fk_engine)

    _jobs["job-3"] = JobStatus()
    with patch("app.import_manager.ROOT", tmp_path):
        _run_import_job("job-3", "path", str(tmp_path / "absente.tar.gz"))

    job = _jobs["job-3"]
    assert job.status == "error"
    assert "introuvable" in job.message

    from sqlmodel import Session
    with Session(fk_engine) as session:
        log = session.exec(select(ImportLog)).one()
        assert "absente.tar.gz" in log.source
        assert "introuvable" in log.error
        assert log.is_resolved is False


def test_log_import_error_n_explose_pas_si_base_indisponible(monkeypatch):
    """_log_import_error est best-effort : moteur cassé → aucune exception."""
    import app.database as database
    broken = MagicMock()
    broken.connect.side_effect = RuntimeError("db down")
    monkeypatch.setattr(database, "engine", broken)

    import_manager._log_import_error("src", "boom")  # ne doit pas lever


# ── Protections Zip Slip / Tar Slip ──────────────────────────────────────────

def test_extract_zip_slip_rejete(tmp_path):
    archive = tmp_path / "evil.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("../evil.txt", "pwned")

    job = JobStatus()
    with pytest.raises(RuntimeError, match="Zip Slip"):
        import_manager._extract(job, archive, tmp_path / "extract")
    assert not (tmp_path / "evil.txt").exists()


def test_extract_tar_slip_rejete(tmp_path):
    archive = _make_targz(tmp_path / "evil.tar.gz", {"../evil.txt": "pwned"})

    job = JobStatus()
    with pytest.raises(RuntimeError, match="Tar Slip"):
        import_manager._extract(job, archive, tmp_path / "extract")
    assert not (tmp_path / "evil.txt").exists()


def test_extract_tar_symlink_hors_archive_rejete(tmp_path):
    archive = tmp_path / "evil-link.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        info = tarfile.TarInfo(name="lien")
        info.type = tarfile.SYMTYPE
        info.linkname = "../../secret"
        tar.addfile(info)

    job = JobStatus()
    with pytest.raises(RuntimeError, match="lien hors archive"):
        import_manager._extract(job, archive, tmp_path / "extract")


# ── _download : erreur HTTP ──────────────────────────────────────────────────

def test_download_erreur_http_leve_runtime_error(tmp_path):
    resp = MagicMock()
    resp.ok = False
    resp.status_code = 503

    job = JobStatus()
    with patch("app.import_manager.requests.get", return_value=resp):
        with pytest.raises(RuntimeError, match="503"):
            import_manager._download(job, "https://x/pkg.tar.gz", tmp_path / "dl")


# ── start_import_job : fil complet en arrière-plan ───────────────────────────

def test_start_import_job_execute_le_job_en_arriere_plan(tmp_path):
    """Le thread démarré par start_import_job mène le job jusqu'à 'done'."""
    archive = _make_targz(tmp_path / "pkg.tar.gz", {
        "recipes/cookomix/flan_r7/recette.md": "# Flan",
    })
    mock_ir = MagicMock()
    mock_ir.run_sync.return_value = {"added": 1, "updated": 0, "deleted": 0, "errors": 0, "error_details": []}

    with patch("app.import_manager.ROOT", tmp_path), \
         patch.dict(sys.modules, {"import_recipes": mock_ir}):
        job_id = import_manager.start_import_job("path", str(archive))
        deadline = time.time() + 3.0
        while _jobs[job_id].status not in ("done", "error") and time.time() < deadline:
            time.sleep(0.02)

    assert _jobs[job_id].status == "done", _jobs[job_id].message
    assert (tmp_path / "data" / "recipes" / "cookomix" / "flan_r7").is_dir()
