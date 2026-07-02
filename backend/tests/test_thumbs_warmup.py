"""Tests de warmup_thumbnails et des chemins d'erreur de app/thumbs.py (base FK réelle)."""
import sys
import os
from io import BytesIO
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import Recipe  # noqa: E402


def _jpeg_bytes(color=(244, 162, 97)) -> bytes:
    from PIL import Image
    img = Image.new("RGB", (876, 720), color=color)
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── generate_thumbnail : traversée de chemin ─────────────────────────────────

def test_generate_thumbnail_refuse_la_traversee_de_chemin(tmp_path):
    """Un dossier contenant `..` qui sort de RECIPES_DIR → ValueError."""
    from app.thumbs import generate_thumbnail

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"):
        (tmp_path / "recipes").mkdir()
        (tmp_path / "secret.jpg").write_bytes(_jpeg_bytes())

        with pytest.raises(ValueError, match="Chemin original invalide"):
            generate_thumbnail("..", "secret.jpg", "thumb")


def test_route_thumb_image_corrompue_retourne_422(tmp_path):
    """Un fichier illisible par Pillow (ni ValueError ni FileNotFoundError) → 422."""
    from app.main import app
    from fastapi.testclient import TestClient

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"):
        orig_dir = tmp_path / "recipes" / "ma-recette_r42" / "images"
        orig_dir.mkdir(parents=True)
        (orig_dir / "corrompue.jpg").write_bytes(b"ceci n'est pas une image")

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/thumbs/ma-recette_r42/images/corrompue.jpg?size=thumb")

    assert resp.status_code == 422
    assert "miniature" in resp.json()["detail"]


# ── warmup_thumbnails ────────────────────────────────────────────────────────

def _seed_recipe(session, folder, image, color=None):
    session.add(Recipe(
        id=f"id_{folder}", title=folder, slug=folder, folder_name=folder,
        content_md="# x", image_main=image, dominant_color=color,
    ))
    session.commit()


def test_warmup_genere_miniatures_et_couleur_dominante(fk_engine, fk_session, tmp_path):
    """Recette sans dominant_color : miniatures générées + couleur écrite en base."""
    from app.thumbs import warmup_thumbnails

    _seed_recipe(fk_session, "tarte_r1", "images/principale.jpg")
    orig = tmp_path / "recipes" / "tarte_r1" / "images" / "principale.jpg"
    orig.parent.mkdir(parents=True)
    orig.write_bytes(_jpeg_bytes(color=(10, 20, 30)))

    progress_calls = []
    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"), \
         patch("app.thumbs.engine", fk_engine):
        count = warmup_thumbnails(progress_callback=lambda c, t: progress_calls.append((c, t)))

    assert count == 1
    assert (tmp_path / "thumbs" / "thumb" / "tarte_r1" / "images" / "principale.jpg.webp").exists()
    assert (tmp_path / "thumbs" / "medium" / "tarte_r1" / "images" / "principale.jpg.webp").exists()
    assert progress_calls == [(1, 1)]

    fk_session.expire_all()
    recipe = fk_session.get(Recipe, "id_tarte_r1")
    # La couleur dominante est écrite en base (tolérance sur la compression JPEG)
    assert recipe.dominant_color is not None
    assert recipe.dominant_color.startswith("#") and len(recipe.dominant_color) == 7
    r, g, b = (int(recipe.dominant_color[i:i + 2], 16) for i in (1, 3, 5))
    assert abs(r - 10) <= 6 and abs(g - 20) <= 6 and abs(b - 30) <= 6


def test_warmup_ignore_les_recettes_deja_colorees_et_sans_image(fk_engine, fk_session, tmp_path):
    """Recettes avec dominant_color déjà rempli ou sans image_main : non traitées."""
    from app.thumbs import warmup_thumbnails

    _seed_recipe(fk_session, "deja-coloree_r2", "images/p.jpg", color="#ffffff")
    fk_session.add(Recipe(id="sans-image_r3", title="x", slug="x", folder_name="sans-image_r3",
                          content_md="# x", image_main=None))
    fk_session.commit()

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"), \
         patch("app.thumbs.engine", fk_engine):
        count = warmup_thumbnails()

    assert count == 0
    assert not (tmp_path / "thumbs").exists()


def test_warmup_saute_les_images_manquantes_sur_disque(fk_engine, fk_session, tmp_path):
    """Une recette dont le fichier image n'existe pas est ignorée sans erreur."""
    from app.thumbs import warmup_thumbnails

    _seed_recipe(fk_session, "fantome_r4", "images/absente.jpg")
    (tmp_path / "recipes").mkdir()

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"), \
         patch("app.thumbs.engine", fk_engine):
        count = warmup_thumbnails()

    assert count == 0
    fk_session.expire_all()
    assert fk_session.get(Recipe, "id_fantome_r4").dominant_color is None
