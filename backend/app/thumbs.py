"""Endpoint de génération de miniatures WebP à la demande avec cache disque."""
from pathlib import Path
from typing import Callable, Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from PIL import Image
from sqlalchemy import text

from app.database import engine

router = APIRouter()

# Chemins — définis comme variables de module pour pouvoir être patchés dans les tests
ROOT = Path(__file__).parent.parent          # /app en Docker, backend/ en dev
RECIPES_DIR = ROOT / "data" / "recipes"
THUMBS_DIR = ROOT / "data" / "thumbs"

SIZES: dict[str, tuple[int, int]] = {
    "thumb": (400, 225),
    "medium": (800, 600),
}


def _extract_dominant_color(img: Image.Image) -> str:
    """Retourne la couleur dominante de l'image en hex (#rrggbb)."""
    pixel = img.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    r, g, b = pixel[:3]
    return f"#{r:02x}{g:02x}{b:02x}"


def _save_dominant_color(folder: str, hex_color: str) -> None:
    """Écrit dominant_color dans recipe via UPDATE direct (best-effort, sans exception)."""
    try:
        with engine.connect() as conn:
            conn.execute(
                text("UPDATE recipe SET dominant_color = :color WHERE folder_name = :folder"),
                {"color": hex_color, "folder": folder},
            )
            conn.commit()
    except Exception:
        pass  # non bloquant — la miniature est servie même si l'UPDATE échoue


def generate_thumbnail(folder: str, filepath: str, size: Literal["thumb", "medium"]) -> Path:
    """
    Génère une miniature WebP et la met en cache sur disque.
    Extrait la couleur dominante lors de la génération.
    Retourne le chemin vers le fichier généré.
    """
    w, h = SIZES[size]

    # Résolution des chemins
    original_path = (RECIPES_DIR / folder / filepath).resolve()
    if not original_path.is_relative_to(RECIPES_DIR.resolve()):
        raise ValueError("Chemin original invalide")

    cache_path = (THUMBS_DIR / size / folder / (filepath + ".webp")).resolve()
    if not cache_path.is_relative_to(THUMBS_DIR.resolve()):
        raise ValueError("Chemin de cache invalide")

    # Si déjà en cache, on retourne
    if cache_path.exists():
        return cache_path

    # Ouvrir l'original
    if not original_path.exists():
        raise FileNotFoundError(f"Image originale introuvable: {original_path}")

    img = Image.open(original_path).convert("RGB")
    
    # Extraire la couleur dominante (avant le resize destructif)
    dominant_color = _extract_dominant_color(img)

    # Redimensionner en préservant le ratio
    img.thumbnail((w, h), Image.LANCZOS)

    # Sauvegarder en cache WebP
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(cache_path, format="WEBP", quality=82)

    # Écrire la couleur dominante en base (best-effort, non bloquant)
    _save_dominant_color(folder, dominant_color)
    
    return cache_path


@router.get("/thumbs/{folder:path}/{filepath:path}")
def get_thumb(
    folder: str,
    filepath: str,
    size: Literal["thumb", "medium"] = "thumb",
) -> Response:
    """
    Endpoint de miniatures WebP avec cache disque.
    """
    try:
        cache_path = generate_thumbnail(folder, filepath, size)
        return FileResponse(
            cache_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=422, detail="Erreur lors de la génération de la miniature")


def warmup_thumbnails(
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> int:
    """
    Génère préventivement les miniatures et remplit dominant_color pour toutes
    les recettes qui n'ont pas encore de couleur dominante en base.
    Retourne le nombre de recettes traitées avec succès.
    """
    from sqlmodel import Session, select
    from app.models import Recipe

    count = 0
    with Session(engine) as session:
        statement = select(Recipe).where(Recipe.image_main.is_not(None), Recipe.dominant_color.is_(None))
        recipes = session.exec(statement).all()
        total = len(recipes)

        for r in recipes:
            try:
                original_path = (RECIPES_DIR / r.folder_name / r.image_main).resolve()
                if not original_path.exists():
                    continue

                img = Image.open(original_path).convert("RGB")
                dominant_color = _extract_dominant_color(img)
                _save_dominant_color(r.folder_name, dominant_color)

                # Générer les miniatures si elles n'existent pas encore
                generate_thumbnail(r.folder_name, r.image_main, "thumb")
                generate_thumbnail(r.folder_name, r.image_main, "medium")
                count += 1
            except Exception:
                continue
            if progress_callback:
                progress_callback(count, total)
    return count
