"""Tests d'intégration pour les endpoints favoris (POST /favorites/sync, GET /recipes/favorites)."""
import sys
import os
from datetime import datetime
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _FakeUser:
    id = 1
    username = "alice"
    is_active = True
    is_admin = False
    created_at = datetime(2024, 1, 1)
    hashed_password = "hashed_secret"


def _make_client(existing_favorites=None, valid_recipe_ids=None):
    """Crée un TestClient avec session et auth mockées.

    - existing_favorites : favoris actuels de l'utilisateur (1er exec)
    - valid_recipe_ids   : IDs de recettes valides retournés lors du filtrage FK (2e exec)
                          Si None, on retourne les IDs passés dans la requête (tous valides).
    """
    from app.main import app, get_session
    from app.auth import get_current_user
    from fastapi.testclient import TestClient

    mock_session = MagicMock()

    # side_effect permet de retourner des valeurs différentes à chaque appel exec()
    call_count = [0]
    first_result = MagicMock()
    first_result.all.return_value = existing_favorites or []

    def exec_side_effect(statement):
        call_count[0] += 1
        if call_count[0] == 1:
            # 1er appel : récupération des favoris existants
            return first_result
        else:
            # 2e appel : validation des recipe_ids (filtrage FK)
            result = MagicMock()
            if valid_recipe_ids is not None:
                result.all.return_value = list(valid_recipe_ids)
            else:
                # Par défaut : tous les IDs demandés sont valides
                result.all.return_value = []  # sera surchargé par les tests si besoin
            return result

    mock_session.exec.side_effect = exec_side_effect

    def override_session():
        yield mock_session

    def override_auth():
        return _FakeUser()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = override_auth

    client = TestClient(app, raise_server_exceptions=False)
    return client, mock_session


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


def test_sync_favorites_remplace_les_existants():
    """POST /favorites/sync supprime les anciens favoris et insère les nouveaux."""
    from app.models import UserFavorite

    fav_existant = MagicMock(spec=UserFavorite)
    fav_existant.recipe_id = "r99"

    client, mock_session = _make_client(
        existing_favorites=[fav_existant],
        valid_recipe_ids=["r1", "r2"],
    )
    try:
        resp = client.post("/favorites/sync", json=["r1", "r2"])

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert set(data["saved_ids"]) == {"r1", "r2"}

        # L'ancien favori doit être supprimé
        mock_session.delete.assert_called_once_with(fav_existant)

        # Les deux nouveaux favoris doivent être insérés
        added = [call.args[0] for call in mock_session.add.call_args_list]
        assert len(added) == 2
        recipe_ids = {f.recipe_id for f in added}
        assert recipe_ids == {"r1", "r2"}

        mock_session.commit.assert_called_once()
    finally:
        _cleanup()


def test_sync_favorites_ignore_ids_inexistants():
    """POST /favorites/sync ignore silencieusement les IDs de recettes inexistants."""
    client, mock_session = _make_client(
        existing_favorites=[],
        valid_recipe_ids=["r1"],  # r1 valide, fake_r999 inexistant
    )
    try:
        resp = client.post("/favorites/sync", json=["r1", "fake_r999"])

        assert resp.status_code == 200

        # Seul r1 doit être inséré
        added = [call.args[0] for call in mock_session.add.call_args_list]
        assert len(added) == 1
        assert added[0].recipe_id == "r1"
    finally:
        _cleanup()


def test_sync_favorites_liste_vide_supprime_tout():
    """POST /favorites/sync avec [] supprime tous les favoris existants."""
    from app.models import UserFavorite

    fav1 = MagicMock(spec=UserFavorite)
    fav2 = MagicMock(spec=UserFavorite)

    client, mock_session = _make_client(existing_favorites=[fav1, fav2])
    try:
        resp = client.post("/favorites/sync", json=[])

        assert resp.status_code == 200
        assert mock_session.delete.call_count == 2
        mock_session.add.assert_not_called()
        mock_session.commit.assert_called_once()
    finally:
        _cleanup()


def test_sync_favorites_sans_auth_retourne_401():
    """POST /favorites/sync sans cookie d'authentification → 401."""
    from app.main import app, get_session
    from fastapi.testclient import TestClient

    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = []

    def override_session():
        yield mock_session

    app.dependency_overrides[get_session] = override_session

    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.post("/favorites/sync", json=["r1"])
        assert resp.status_code == 401
    finally:
        _cleanup()


# ── GET /recipes/favorites ────────────────────────────────────────────────────

def _make_client_get(recipes=None):
    """Crée un TestClient pour GET /recipes/favorites avec auth mockée."""
    from app.main import app, get_session
    from app.auth import get_current_user
    from fastapi.testclient import TestClient

    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = recipes or []

    def override_session():
        yield mock_session

    def override_auth():
        return _FakeUser()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = override_auth

    return TestClient(app, raise_server_exceptions=False), mock_session


def test_get_favorites_retourne_liste_recettes():
    """GET /recipes/favorites → 200 + liste des recettes de l'utilisateur."""
    from app.schemas import RecipePreview

    fake_recipe = MagicMock(spec=RecipePreview)
    fake_recipe.id = "r1"
    fake_recipe.title = "Tarte aux pommes"
    fake_recipe.slug = "tarte-aux-pommes"
    fake_recipe.folder_name = "tarte-aux-pommes_r1"
    fake_recipe.image_main = None
    fake_recipe.difficulty = "Facile"
    fake_recipe.total_time = 2700
    fake_recipe.dominant_color = None
    fake_recipe.category = "Dessert"

    client, _ = _make_client_get(recipes=[fake_recipe])
    try:
        resp = client.get("/recipes/favorites")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == "r1"
        assert data[0]["title"] == "Tarte aux pommes"
    finally:
        _cleanup()


def test_get_favorites_liste_vide():
    """GET /recipes/favorites → 200 + [] quand l'utilisateur n'a pas de favoris."""
    client, _ = _make_client_get(recipes=[])
    try:
        resp = client.get("/recipes/favorites")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        _cleanup()


def test_get_favorites_sans_auth_retourne_401():
    """GET /recipes/favorites sans authentification → 401."""
    from app.main import app, get_session
    from fastapi.testclient import TestClient

    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = []

    def override_session():
        yield mock_session

    app.dependency_overrides[get_session] = override_session

    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.get("/recipes/favorites")
        assert resp.status_code == 401
    finally:
        _cleanup()
