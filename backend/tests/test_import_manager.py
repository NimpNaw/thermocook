"""Tests unitaires pour import_manager."""
from unittest.mock import MagicMock, patch

import pytest
import sys
import os

# Ajouter le répertoire backend au path pour les imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_start_import_job_returns_uuid():
    """start_import_job retourne un job_id non vide."""
    from app import import_manager
    import_manager._jobs.clear()

    with patch.object(import_manager, "_run_import_job"):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            job_id = import_manager.start_import_job("path", "/tmp/fake.tar.gz")

    assert job_id
    assert len(job_id) == 36  # UUID format


def test_start_import_job_rejects_concurrent():
    """Un second job est rejeté si un job est déjà en cours."""
    from app import import_manager
    import_manager._jobs.clear()

    with patch("threading.Thread") as mock_thread:
        mock_thread.return_value = MagicMock()
        import_manager.start_import_job("path", "/tmp/fake.tar.gz")

    # Le premier job est en statut "pending" — le second doit lever RuntimeError
    with pytest.raises(RuntimeError, match="job_already_running"):
        with patch("threading.Thread"):
            import_manager.start_import_job("path", "/tmp/other.tar.gz")


def test_get_job_status_unknown():
    """get_job_status retourne None pour un job_id inconnu."""
    from app import import_manager
    assert import_manager.get_job_status("nonexistent-id") is None


def test_get_job_status_known():
    """get_job_status retourne le statut d'un job connu."""
    from app import import_manager
    import_manager._jobs.clear()

    with patch("threading.Thread") as mock_thread:
        mock_thread.return_value = MagicMock()
        job_id = import_manager.start_import_job("path", "/tmp/fake.tar.gz")

    status = import_manager.get_job_status(job_id)
    assert status is not None
    assert status.status == "pending"


def test_validate_local_path_missing(tmp_path):
    """validate_source lève ValueError si le chemin local n'existe pas."""
    from app.import_manager import validate_source
    with pytest.raises(ValueError, match="introuvable"):
        validate_source("path", str(tmp_path / "missing.tar.gz"))


def test_validate_local_path_ok(tmp_path):
    """validate_source ne lève rien si le chemin local existe."""
    from app.import_manager import validate_source
    f = tmp_path / "pkg.tar.gz"
    f.write_bytes(b"fake")
    validate_source("path", str(f))  # ne doit pas lever


def test_validate_url_ok():
    """validate_source ne lève rien pour une URL http."""
    from app.import_manager import validate_source
    validate_source("url", "https://example.com/fabien/thermocook/releases/download/cookidoo-v1.0.0/cookidoo-v1.0.0.tar.gz")


def test_extract_finds_nested_recipes_dir(tmp_path):
    """_extract localise recipes/ même s'il est dans un sous-dossier."""
    import tarfile
    from app import import_manager

    # Créer une archive avec structure imbriquée : cookidoo-v1.0.0/recipes/ma-recette/
    recipe_dir = tmp_path / "src" / "cookidoo-v1.0.0" / "recipes" / "ma-recette"
    recipe_dir.mkdir(parents=True)
    (recipe_dir / "index.md").write_text("# Test")

    archive_path = tmp_path / "test.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(recipe_dir.parent.parent.parent, arcname=".")

    # Patch ROOT pour pointer vers tmp_path
    original_root = import_manager.ROOT
    import_manager.ROOT = tmp_path
    try:
        job = import_manager.JobStatus()
        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()
        import_manager._extract(job, archive_path, extract_dir)
        assert (tmp_path / "data" / "recipes" / "ma-recette").exists()
    finally:
        import_manager.ROOT = original_root


def test_extract_raises_if_no_recipes_dir(tmp_path):
    """_extract lève RuntimeError si aucun dossier recipes/ n'est trouvé."""
    import tarfile
    from app import import_manager

    # Archive sans dossier recipes/
    dummy_dir = tmp_path / "src" / "other-dir"
    dummy_dir.mkdir(parents=True)
    (dummy_dir / "file.txt").write_text("hello")

    archive_path = tmp_path / "test.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(dummy_dir.parent.parent, arcname=".")

    original_root = import_manager.ROOT
    import_manager.ROOT = tmp_path
    try:
        job = import_manager.JobStatus()
        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()
        with pytest.raises(RuntimeError, match="recipes/"):
            import_manager._extract(job, archive_path, extract_dir)
    finally:
        import_manager.ROOT = original_root


def test_extract_finds_recipes_at_root(tmp_path):
    """_extract fonctionne avec une archive ayant recipes/ directement à la racine."""
    import tarfile
    from app import import_manager

    recipe_dir = tmp_path / "src" / "recipes" / "ma-recette"
    recipe_dir.mkdir(parents=True)
    (recipe_dir / "index.md").write_text("# Test")

    archive_path = tmp_path / "test.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(recipe_dir.parent.parent, arcname=".")

    original_root = import_manager.ROOT
    import_manager.ROOT = tmp_path
    try:
        job = import_manager.JobStatus()
        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()
        import_manager._extract(job, archive_path, extract_dir)
        assert (tmp_path / "data" / "recipes" / "ma-recette").exists()
    finally:
        import_manager.ROOT = original_root


def test_extract_zip_nested_recipes_dir(tmp_path):
    """_extract supporte les archives .zip avec recipes/ imbriqué."""
    import zipfile
    from app import import_manager

    recipe_dir = tmp_path / "src" / "cookidoo-v1.1.0" / "recipes" / "ma-recette"
    recipe_dir.mkdir(parents=True)
    (recipe_dir / "recette.md").write_text("# Test zip")

    archive_path = tmp_path / "test.zip"
    with zipfile.ZipFile(archive_path, "w") as zf:
        for f in recipe_dir.rglob("*"):
            zf.write(f, f.relative_to(tmp_path / "src"))

    original_root = import_manager.ROOT
    import_manager.ROOT = tmp_path
    try:
        job = import_manager.JobStatus()
        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()
        import_manager._extract(job, archive_path, extract_dir)
        assert (tmp_path / "data" / "recipes" / "ma-recette").exists()
    finally:
        import_manager.ROOT = original_root


def test_extract_zip_raises_if_no_recipes_dir(tmp_path):
    """_extract lève RuntimeError pour un .zip sans dossier recipes/."""
    import zipfile
    from app import import_manager

    dummy = tmp_path / "src" / "other-dir" / "file.txt"
    dummy.parent.mkdir(parents=True)
    dummy.write_text("hello")

    archive_path = tmp_path / "test.zip"
    with zipfile.ZipFile(archive_path, "w") as zf:
        zf.write(dummy, "other-dir/file.txt")

    original_root = import_manager.ROOT
    import_manager.ROOT = tmp_path
    try:
        job = import_manager.JobStatus()
        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()
        with pytest.raises(RuntimeError, match="recipes/"):
            import_manager._extract(job, archive_path, extract_dir)
    finally:
        import_manager.ROOT = original_root


def test_download_uses_zip_extension_for_zip_url(tmp_path):
    """_download nomme le fichier .zip si l'URL se termine par .zip."""
    from unittest.mock import patch, MagicMock
    from app import import_manager

    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.headers = {"Content-Length": "100"}
    mock_resp.iter_content = lambda chunk_size: [b"x" * 100]

    job = import_manager.JobStatus()
    with patch("requests.get", return_value=mock_resp):
        path = import_manager._download(job, "https://example.com/pkg.zip", tmp_path)

    assert path.suffix == ".zip"


def test_log_collector_appends_timestamped_line():
    """LogCollector.log() ajoute une ligne avec horodatage."""
    from app.import_manager import LogCollector
    c = LogCollector()
    c.log("hello world")
    assert len(c.lines) == 1
    assert "hello world" in c.lines[0]
    assert c.lines[0].startswith("[")   # format [HH:MM:SS]


def test_log_collector_as_text_joins_lines():
    """LogCollector.as_text() retourne les lignes jointes par \n."""
    from app.import_manager import LogCollector
    c = LogCollector()
    c.log("ligne A")
    c.log("ligne B")
    text = c.as_text()
    assert "ligne A" in text
    assert "ligne B" in text
    assert text.index("ligne A") < text.index("ligne B")


def test_job_status_has_log_collector():
    """JobStatus() initialise automatiquement un LogCollector."""
    from app.import_manager import JobStatus, LogCollector
    job = JobStatus()
    assert isinstance(job.collector, LogCollector)
    assert job.collector.lines == []


def test_job_status_collector_independent():
    """Deux JobStatus ont des collecteurs indépendants."""
    from app.import_manager import JobStatus
    j1 = JobStatus()
    j2 = JobStatus()
    j1.collector.log("only in j1")
    assert len(j2.collector.lines) == 0


def test_import_sql_passe_log_fn_a_run_sync():
    """_import_sql passe job.collector.log comme log_fn à run_sync — le log est peuplé."""
    import sys
    from app import import_manager

    def fake_run_sync(progress_callback=None, log_fn=None):
        if log_fn:
            log_fn("Message de run_sync")
        return {"added": 1, "updated": 0, "deleted": 0, "errors": 0, "error_details": [], "stale_in_db": []}

    fake_module = type(sys)("import_recipes")
    fake_module.run_sync = fake_run_sync

    job = import_manager.JobStatus()
    with patch.dict(sys.modules, {"import_recipes": fake_module}):
        import_manager._import_sql(job)

    log_text = job.collector.as_text()
    assert "Synchronisation SQL démarrée" in log_text
    assert "Message de run_sync" in log_text


def test_download_logs_events_into_collector(tmp_path):
    """_download trace les événements dans job.collector."""
    from unittest.mock import patch, MagicMock
    from app import import_manager

    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.headers = {"Content-Length": "20000000"}   # 20 Mo
    # Deux chunks de 10 Mo pour déclencher le log intermédiaire
    mock_resp.iter_content = lambda chunk_size: [b"x" * 10_000_000, b"x" * 10_000_000]

    job = import_manager.JobStatus()
    with patch("requests.get", return_value=mock_resp):
        import_manager._download(job, "https://example.com/pkg.tar.gz", tmp_path)

    log_text = job.collector.as_text()
    assert "Téléchargement démarré" in log_text
    assert "Téléchargement terminé" in log_text


def test_extract_logs_into_collector(tmp_path):
    """_extract trace le début et la fin dans job.collector."""
    import tarfile
    from app import import_manager

    recipe_dir = tmp_path / "src" / "recipes" / "ma-recette"
    recipe_dir.mkdir(parents=True)
    (recipe_dir / "recette.md").write_text("# Test")

    archive_path = tmp_path / "test.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(recipe_dir.parent.parent, arcname=".")

    original_root = import_manager.ROOT
    import_manager.ROOT = tmp_path
    try:
        job = import_manager.JobStatus()
        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()
        import_manager._extract(job, archive_path, extract_dir)
        log_text = job.collector.as_text()
        assert "Extraction" in log_text
    finally:
        import_manager.ROOT = original_root


