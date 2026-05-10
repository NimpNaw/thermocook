"""Gestionnaire de jobs d'import de packages de recettes."""

import re
import shutil
import tarfile
import threading
import zipfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

import requests

ROOT = Path(__file__).parent.parent  # /app en Docker, backend/ en dev

SSL_VERIFY = False  # Désactivé pour supporter les serveurs auto-hébergés


@dataclass
class LogCollector:
    lines: list[str] = field(default_factory=list)

    def log(self, msg: str) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        self.lines.append(f"[{ts}] {msg}")

    def as_text(self) -> str:
        return "\n".join(self.lines)


@dataclass
class JobStatus:
    status: str = "pending"   # pending | downloading | extracting | importing | done | error
    progress: int = 0
    message: str = ""
    errors: list[str] = None  # Liste détaillée des erreurs structurelles
    collector: LogCollector = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.collector is None:
            self.collector = LogCollector()


_jobs: Dict[str, JobStatus] = {}
_lock = threading.Lock()


def validate_source(source: str, value: str) -> None:
    """Valide la source avant de démarrer le job. Lève ValueError si invalide."""
    if source == "path":
        if not Path(value).exists():
            raise ValueError(f"Fichier introuvable : {value}")
    # Pour "url", on ne valide pas le contenu à l'avance


def start_import_job(source: str, value: str) -> str:
    """Démarre un job d'import en arrière-plan. Retourne le job_id.

    Lève RuntimeError("job_already_running") si un job est déjà actif.
    """
    with _lock:
        for job in _jobs.values():
            if job.status not in ("done", "error"):
                raise RuntimeError("job_already_running")
        job_id = str(uuid.uuid4())
        _jobs[job_id] = JobStatus(status="pending", progress=0, message="Démarrage...")

    thread = threading.Thread(
        target=_run_import_job, args=(job_id, source, value), daemon=True
    )
    thread.start()
    return job_id


def get_job_status(job_id: str) -> Optional[JobStatus]:
    """Retourne le statut d'un job, ou None si inconnu."""
    return _jobs.get(job_id)


def get_active_job() -> Optional[tuple[str, JobStatus]]:
    """Retourne (job_id, snapshot) du job en cours, ou du dernier job terminé.

    Permet au frontend de se reconnecter après une navigation :
    - Job en cours → reprendre le polling avec le job_id récupéré
    - Dernier job terminé → afficher le résultat final
    - Aucun job → None

    Retourne un snapshot (copie) pour éviter les races avec le thread d'import.
    """
    from dataclasses import replace
    with _lock:
        for job_id, job in _jobs.items():
            if job.status not in ("done", "error"):
                return job_id, replace(job)
        if _jobs:
            last_id = list(_jobs.keys())[-1]
            return last_id, replace(_jobs[last_id])
        return None


def _run_import_job(job_id: str, source: str, value: str) -> None:
    job = _jobs[job_id]
    job.collector.log(f"Import démarré — source: {source}")
    tmp_dir = ROOT / f"tmp-import-{job_id}"

    try:
        if source == "url":
            archive_path = _download(job, value, tmp_dir)
        else:
            archive_path = Path(value)
            job.collector.log(f"Archive locale : {value}")

        _extract(job, archive_path, tmp_dir)
        _import_sql(job)
        # status/progress/message déjà positionnés par _import_sql

    except Exception as e:
        job.status = "error"
        job.message = str(e)
        job.collector.log(f"❌ Erreur fatale : {e}")
        _log_import_error(value, str(e))

    finally:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


def _log_import_error(source: str, error: str) -> None:
    """Persiste une erreur d'import en base (best-effort, sans lever d'exception)."""
    try:
        from sqlmodel import Session
        from app.database import engine
        from app.models import ImportLog
        with Session(engine) as session:
            session.add(ImportLog(source=source, error=error))
            session.commit()
    except Exception:
        pass


def _download(job: JobStatus, url: str, tmp_dir: Path) -> Path:
    job.collector.log(f"Téléchargement démarré : {url}")
    job.status = "downloading"
    job.progress = 0
    job.message = "Connexion..."

    tmp_dir.mkdir(parents=True, exist_ok=True)
    ext = ".zip" if url.lower().endswith(".zip") else ".tar.gz"
    archive_path = tmp_dir / f"package{ext}"

    # timeout=(connexion, lecture) : 10s pour la connexion, pas de limite pour le streaming
    resp = requests.get(url, stream=True, verify=SSL_VERIFY, timeout=(10, None))
    if not resp.ok:
        raise RuntimeError(f"Erreur HTTP {resp.status_code} lors du téléchargement")

    total = int(resp.headers.get("Content-Length", 0))
    downloaded = 0
    last_logged_mb = -1

    with open(archive_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
            downloaded += len(chunk)
            if total:
                pct = int(downloaded / total * 40)
                job.progress = pct
                mb = downloaded / 1_000_000
                total_mb = total / 1_000_000
                job.message = f"Téléchargement : {mb:.0f} Mo / {total_mb:.0f} Mo"
                current_10mb = int(mb / 10)
                if current_10mb > last_logged_mb:
                    job.collector.log(f"Téléchargement : {mb:.0f} Mo / {total_mb:.0f} Mo")
                    last_logged_mb = current_10mb

    total_mb_str = f"{downloaded / 1_000_000:.1f} Mo"
    job.collector.log(f"Téléchargement terminé ({total_mb_str})")
    job.progress = 40
    job.message = "Téléchargement terminé"
    return archive_path


def _extract(job: JobStatus, archive_path: Path, tmp_dir: Path) -> None:
    job.collector.log("Extraction de l'archive démarrée")
    job.status = "extracting"
    job.progress = 40
    job.message = "Extraction en cours..."

    if not archive_path.exists():
        raise RuntimeError(f"Archive introuvable : {archive_path}")

    tmp_dir.mkdir(parents=True, exist_ok=True)

    if archive_path.suffix == ".zip":
        with zipfile.ZipFile(archive_path, "r") as zf:
            resolved_tmp = tmp_dir.resolve()
            for member in zf.infolist():
                dest = (tmp_dir / member.filename).resolve()
                if not str(dest).startswith(str(resolved_tmp) + "/"):
                    raise RuntimeError(f"Archive invalide (Zip Slip) : {member.filename}")
            zf.extractall(tmp_dir)
    else:
        with tarfile.open(archive_path, "r:gz") as tar:
            # Validation manuelle (Tar Slip) — `filter="data"` n'arrive qu'en
            # Python 3.12, et l'image Docker tourne actuellement sur 3.11.
            resolved_tmp = tmp_dir.resolve()
            for member in tar.getmembers():
                dest = (tmp_dir / member.name).resolve()
                if not str(dest).startswith(str(resolved_tmp) + "/") and dest != resolved_tmp:
                    raise RuntimeError(f"Archive invalide (Tar Slip) : {member.name}")
                if member.issym() or member.islnk():
                    link_target = (dest.parent / member.linkname).resolve()
                    if not str(link_target).startswith(str(resolved_tmp) + "/"):
                        raise RuntimeError(f"Archive invalide (lien hors archive) : {member.name}")
            try:
                tar.extractall(tmp_dir, filter="data")   # Python ≥ 3.12 (défense en profondeur)
            except TypeError:
                tar.extractall(tmp_dir)                  # Python ≤ 3.11 (validé au-dessus)

    # Recherche récursive du dossier recipes/ quelle que soit la structure de l'archive
    recipes_src = next((p for p in tmp_dir.rglob("recipes") if p.is_dir()), None)
    if recipes_src is None:
        raise RuntimeError("Structure d'archive invalide : dossier recipes/ introuvable")

    recipes_dest = ROOT / "data" / "recipes"
    recipes_dest.mkdir(parents=True, exist_ok=True)

    # Collecter les IDs de toutes les recettes dans le package (pour nettoyage post-extraction)
    new_recipe_ids: set[str] = set()
    for recipe_dir in recipes_src.iterdir():
        if recipe_dir.is_dir():
            dest = recipes_dest / recipe_dir.name
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(recipe_dir, dest)
            # Collecter les IDs des recettes dans ce sous-dossier source
            for sub in dest.iterdir():
                if sub.is_dir():
                    m = re.search(r"_r([a-zA-Z0-9]+)$", sub.name)
                    if m:
                        new_recipe_ids.add(m.group(1))

    # Supprimer les dossiers plats (ancienne structure) dont l'ID est couvert par le nouveau package
    for flat_dir in recipes_dest.iterdir():
        if flat_dir.is_dir():
            m = re.search(r"_r([a-zA-Z0-9]+)$", flat_dir.name)
            if m and m.group(1) in new_recipe_ids:
                shutil.rmtree(flat_dir, ignore_errors=True)

    job.collector.log("Extraction terminée")
    job.progress = 60
    job.message = "Extraction terminée"


def _import_sql(job: JobStatus) -> None:
    job.status = "importing"
    job.progress = 60
    job.message = "Synchronisation SQL en cours..."
    job.collector.log("Synchronisation SQL démarrée")

    def on_progress(processed: int, total: int, current: str, errors: int) -> None:
        pct = 60 + int(processed / total * 38) if total else 60
        job.progress = pct
        if current and (current.endswith("...") or current.startswith("Miniatures") or current == "Terminé"):
            job.message = current
        else:
            job.message = f"Synchronisation : {processed} / {total} recettes"

    import import_recipes  # importable car ROOT (/app) est dans sys.path
    result = import_recipes.run_sync(
        progress_callback=on_progress,
        log_fn=job.collector.log,
    )

    job.errors = result.get("error_details", [])
    added = result.get("added", 0)
    updated = result.get("updated", 0)
    deleted = result.get("deleted", 0)
    nb_errors = result.get("errors", 0)
    job.message = (
        f"Terminé : +{added} ajout(s), {updated} màj, {deleted} suppression(s)"
        + (f", {nb_errors} erreur(s)" if nb_errors else "")
    )
    # Marquer done ici : élimine la fenêtre où progress=100/message="Terminé"
    # mais status="importing", qui empêchait la détection de fin côté frontend.
    job.status = "done"
    job.progress = 100
