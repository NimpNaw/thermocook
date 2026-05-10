"""Tests pour l'endpoint GET /thumbs/{folder}/{filepath}."""
import sys
import os
from unittest.mock import MagicMock, patch
from io import BytesIO


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SECRET_KEY", "test-secret-key")


def _make_fake_image_bytes() -> bytes:
    """Crée un JPEG minimal en mémoire avec Pillow."""
    from PIL import Image
    img = Image.new("RGB", (876, 720), color=(244, 162, 97))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_client():
    from app.main import app
    from fastapi.testclient import TestClient
    return TestClient(app, raise_server_exceptions=False)


def test_thumb_returns_webp_on_first_request(tmp_path):
    """Première requête : génère le WebP, retourne 200 image/webp."""
    fake_bytes = _make_fake_image_bytes()

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"):

        orig_dir = tmp_path / "recipes" / "ma-recette_r42" / "images"
        orig_dir.mkdir(parents=True)
        (orig_dir / "principale.jpg").write_bytes(fake_bytes)

        client = _make_client()
        resp = client.get("/thumbs/ma-recette_r42/images/principale.jpg?size=thumb")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/webp"


def test_thumb_served_from_cache(tmp_path):
    """Deuxième requête : sert depuis le cache, Pillow.Image.open non rappelé."""
    fake_bytes = _make_fake_image_bytes()

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"):

        orig_dir = tmp_path / "recipes" / "ma-recette_r42" / "images"
        orig_dir.mkdir(parents=True)
        (orig_dir / "principale.jpg").write_bytes(fake_bytes)

        client = _make_client()
        client.get("/thumbs/ma-recette_r42/images/principale.jpg?size=thumb")

        # Patch sur app.thumbs.Image suppose que l'implémentation utilise
        # `from PIL import Image` — c'est la convention attendue dans thumbs.py
        with patch("app.thumbs.Image") as mock_img_module:
            resp = client.get("/thumbs/ma-recette_r42/images/principale.jpg?size=thumb")

    assert resp.status_code == 200
    mock_img_module.open.assert_not_called()


def test_thumb_missing_original_returns_404(tmp_path):
    """Original introuvable → 404."""
    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"):

        (tmp_path / "recipes").mkdir(parents=True)
        (tmp_path / "thumbs").mkdir(parents=True)

        client = _make_client()
        resp = client.get("/thumbs/inexistant_r99/images/principale.jpg?size=thumb")

    assert resp.status_code == 404


def test_thumb_invalid_size_returns_422(tmp_path):
    """?size=large (valeur non autorisée) → 422."""
    client = _make_client()
    resp = client.get("/thumbs/ma-recette_r42/images/principale.jpg?size=large")
    assert resp.status_code == 422


def test_dominant_color_extracted_and_saved(tmp_path):
    """Première génération : dominant_color écrit en base via UPDATE SQL."""
    fake_bytes = _make_fake_image_bytes()

    mock_session = MagicMock()

    with patch("app.thumbs.RECIPES_DIR", tmp_path / "recipes"), \
         patch("app.thumbs.THUMBS_DIR", tmp_path / "thumbs"), \
         patch("app.thumbs.engine") as mock_engine:

        mock_engine.connect.return_value.__enter__.return_value = mock_session
        mock_engine.connect.return_value.__exit__.return_value = False

        orig_dir = tmp_path / "recipes" / "ma-recette_r42" / "images"
        orig_dir.mkdir(parents=True)
        (orig_dir / "principale.jpg").write_bytes(fake_bytes)

        client = _make_client()
        resp = client.get("/thumbs/ma-recette_r42/images/principale.jpg?size=thumb")

    assert resp.status_code == 200
    mock_session.execute.assert_called_once()
    # Vérifie que l'UPDATE cible bien dominant_color (dans le texte SQL ou les params)
    call_args = mock_session.execute.call_args
    sql_text = str(call_args[0][0])  # premier argument positionnel = statement SQL
    params = call_args[0][1] if len(call_args[0]) > 1 else (call_args[1] or {})
    assert "dominant_color" in sql_text or "dominant_color" in str(params)
    assert "color" in str(params) or "#" in str(params)  # valeur hex présente
