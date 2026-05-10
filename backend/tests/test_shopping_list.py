"""Tests pour les endpoints /shopping-list et DELETE /shopping-list/recipe/{id}."""
import sys
import os
from datetime import datetime
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _FakeUser:
    id = 1
    username = "alice"
    is_active = True
    is_admin = False
    created_at = datetime(2024, 1, 1)
    hashed_password = "hashed_secret"


def _make_authed_client(session_mock):
    from app.main import app, get_session
    from app.auth import get_current_user
    from fastapi.testclient import TestClient

    fake_user = _FakeUser()

    def override_session():
        yield session_mock

    def override_user():
        return fake_user

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = override_user
    return TestClient(app, raise_server_exceptions=False)


def test_get_shopping_list_returns_200():
    """GET /shopping-list → 200 même si vide."""
    mock_session = MagicMock()
    # On mocke les multiples exec() : MealPlan, ShoppingListExclusion, Recipe
    mock_session.exec.return_value.all.return_value = []

    client = _make_authed_client(mock_session)
    try:
        resp = client.get("/shopping-list")
        assert resp.status_code == 200
        data = resp.json()
        assert "categories" in data
        assert "recipes" in data
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_get_shopping_list_calls_grouping():
    """GET /shopping-list appelle get_sql_grouped_shopping_list avec les recettes et les exclusions."""
    from app.models import MealPlan

    direct_plan = MagicMock(spec=MealPlan)
    direct_plan.recipe_id = "r99"
    direct_plan.meal_type = "shopping_list"

    mock_session = MagicMock()
    # Mock des exec successifs
    mock_session.exec.return_value.all.side_effect = [
        [direct_plan], # MealPlan
        [],            # ShoppingListExclusion
        [("r99", "Recette 99")] # Recipe (id, title)
    ]

    with patch("app.main.get_sql_grouped_shopping_list", return_value={}) as mock_group:
        client = _make_authed_client(mock_session)
        try:
            resp = client.get("/shopping-list")
            assert resp.status_code == 200
            # get_sql_grouped_shopping_list est appelé avec direct_recipe_ids={"r99"}
            call_kwargs = mock_group.call_args
            assert call_kwargs.kwargs.get("direct_recipe_ids") == {"r99"}
            assert "exclusions" in call_kwargs.kwargs
        finally:
            from app.main import app
            app.dependency_overrides.clear()


def test_add_to_shopping_list_returns_200():
    """POST /shopping-list/add → 200."""
    mock_session = MagicMock()
    # Mock existing check (None)
    mock_session.exec.return_value.first.return_value = None
    
    client = _make_authed_client(mock_session)
    try:
        resp = client.post("/shopping-list/add", json={"recipe_id": "r123"})
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_get_shared_list_returns_200():
    """GET /shared-list/{token} → 200 avec les données du propriétaire."""
    from app.models import SharedLink
    from datetime import datetime, timedelta, timezone

    token = "test-token-123"
    fake_link = MagicMock(spec=SharedLink)
    fake_link.user_id = 1
    fake_link.expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    fake_owner = MagicMock()
    fake_owner.username = "bob"

    mock_session = MagicMock()
    # get 1: SharedLink, get 2: User
    mock_session.get.side_effect = [fake_link, fake_owner]
    # exec 1: MealPlan, exec 2: ShoppingListExclusion, exec 3: Recipe info
    mock_session.exec.return_value.all.side_effect = [
        [], # MealPlan
        [], # Exclusions
        []  # Recipes
    ]

    client = _make_authed_client(mock_session)
    try:
        resp = client.get(f"/shared-list/{token}")
        assert resp.status_code == 200
        assert "owner" in resp.json()
        assert "expires_at" in resp.json()
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_delete_shopping_list_recipe_returns_204():
    """DELETE /shopping-list/recipe/{id} → 204 No Content."""
    from app.models import MealPlan

    fake_plan = MagicMock(spec=MealPlan)
    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = [fake_plan]

    client = _make_authed_client(mock_session)
    try:
        resp = client.delete("/shopping-list/recipe/r1")
        assert resp.status_code == 204
        mock_session.delete.assert_called_once_with(fake_plan)
        mock_session.commit.assert_called_once()
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_add_to_shopping_list_accepts_long_recipe_id():
    """POST /shopping-list/add → 200 même avec un ID recette long (>64 chars)."""
    long_id = "ckdo_cookidoo_verrines-de-soupe-creme-fouettee-au-zeste-d-orange-crumble-de-pain_r709277"
    assert len(long_id) > 64

    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = None

    client = _make_authed_client(mock_session)
    try:
        resp = client.post("/shopping-list/add", json={"recipe_id": long_id})
        assert resp.status_code == 200
    finally:
        from app.main import app
        app.dependency_overrides.clear()


def test_delete_shopping_list_recipe_no_entry_returns_204():
    """DELETE sur recette absente → 204 sans erreur."""
    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = []

    client = _make_authed_client(mock_session)
    try:
        resp = client.delete("/shopping-list/recipe/unknown")
        assert resp.status_code == 204
        mock_session.delete.assert_not_called()
        mock_session.commit.assert_called_once()
    finally:
        from app.main import app
        app.dependency_overrides.clear()
