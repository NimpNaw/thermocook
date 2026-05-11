"""Tests pour GET /recipes/{recipe_id}.

Garde-fous sur le contrat de la réponse : tous les champs visibles dans la
fiche détail (RecipeDetailPage) doivent être présents pour éviter qu'un
champ disparaisse silencieusement du response_model.
"""
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client_with_recipe(recipe, ingredients=None):
    from app.main import app, get_session
    from fastapi.testclient import TestClient

    mock_session = MagicMock()
    mock_session.get.return_value = recipe
    mock_session.exec.return_value.all.return_value = ingredients or []

    def override():
        yield mock_session

    app.dependency_overrides[get_session] = override
    return TestClient(app, raise_server_exceptions=False)


def _full_recipe():
    from app.models import Recipe
    return Recipe(
        id="cookomix_tarte-pomme",
        title="Tarte aux pommes",
        slug="tarte-aux-pommes",
        folder_name="tarte-aux-pommes",
        difficulty="Facile",
        active_time=600,
        total_time=2700,
        portions="6 portions",
        content_md="# Tarte\n",
        steps_json=[{"text": "Étape 1"}],
        image_main="images/principale.jpg",
        dominant_color="#f4a261",
        category="Dessert",
    )


class TestGetRecipeDetailFields:
    """La réponse de GET /recipes/{id} doit exposer tous les champs affichés
    sur la fiche détail. Un champ manquant ici = un bloc vide ('--') dans l'UI."""

    def test_returns_portions(self):
        client = _make_client_with_recipe(_full_recipe())
        try:
            resp = client.get("/recipes/cookomix_tarte-pomme")
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("portions") == "6 portions"
        finally:
            from app.main import app
            app.dependency_overrides.clear()

    def test_returns_all_detail_page_fields(self):
        """Vérifie l'exhaustivité du contrat pour la fiche détail."""
        client = _make_client_with_recipe(_full_recipe())
        try:
            resp = client.get("/recipes/cookomix_tarte-pomme")
            assert resp.status_code == 200
            data = resp.json()

            expected_fields = {
                "id", "title", "slug", "folder_name",
                "difficulty", "total_time", "portions",
                "image_main", "dominant_color", "category",
                "ingredients_json", "steps_json",
            }
            missing = expected_fields - set(data.keys())
            assert not missing, f"Champs absents de la réponse : {missing}"
        finally:
            from app.main import app
            app.dependency_overrides.clear()

    def test_returns_404_when_not_found(self):
        client = _make_client_with_recipe(None)
        try:
            resp = client.get("/recipes/inexistant")
            assert resp.status_code == 404
        finally:
            from app.main import app
            app.dependency_overrides.clear()
