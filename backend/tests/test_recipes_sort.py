"""Tests pour le paramètre sort de GET /recipes."""
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client(recipes: list):
    from app.main import app, get_session
    from fastapi.testclient import TestClient

    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = recipes

    def override():
        yield mock_session

    app.dependency_overrides[get_session] = override
    return TestClient(app, raise_server_exceptions=False)


def _fake_recipe(title: str):
    from app.models import Recipe
    r = Recipe(id=title, title=title, slug=title.lower())
    return r


class TestListRecipesSort:
    def test_sort_random_returns_200(self):
        client = _make_client([_fake_recipe("Tarte aux pommes")])
        resp = client.get("/recipes?sort=random")
        assert resp.status_code == 200

    def test_sort_name_asc_returns_200(self):
        client = _make_client([_fake_recipe("Abricots"), _fake_recipe("Zucchini")])
        resp = client.get("/recipes?sort=name_asc")
        assert resp.status_code == 200

    def test_sort_name_desc_returns_200(self):
        client = _make_client([_fake_recipe("Zucchini"), _fake_recipe("Abricots")])
        resp = client.get("/recipes?sort=name_desc")
        assert resp.status_code == 200

    def test_default_sort_no_param_returns_200(self):
        """Sans paramètre sort, le tri aléatoire est appliqué par défaut."""
        client = _make_client([_fake_recipe("Poulet rôti")])
        resp = client.get("/recipes")
        assert resp.status_code == 200

    def test_sort_with_category_returns_200(self):
        client = _make_client([_fake_recipe("Fondant au chocolat")])
        resp = client.get("/recipes?category=Dessert&sort=name_asc")
        assert resp.status_code == 200

    def test_response_is_list(self):
        client = _make_client([_fake_recipe("Soupe de légumes")])
        resp = client.get("/recipes?sort=name_asc")
        assert isinstance(resp.json(), list)
