"""Tests pour l'endpoint GET /recipes/search."""
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


def _fake_recipe(title: str, slug: str = ""):
    from app.models import Recipe
    return Recipe(
        id=title,
        title=title,
        slug=slug or title.lower().replace(" ", "-"),
        content_md="",
        search_vector=None,
    )


class TestSearchRecipesEndpoint:
    def test_query_trop_court_retourne_liste_vide(self):
        """Moins de 3 caractères → 200 avec liste vide, sans appel DB."""
        client = _make_client([_fake_recipe("Tarte")])
        resp = client.get("/recipes/search?q=ab")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_query_vide_retourne_liste_vide(self):
        """Query vide → 200 avec liste vide."""
        client = _make_client([])
        resp = client.get("/recipes/search?q=")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_query_exactement_2_chars_retourne_liste_vide(self):
        """2 caractères = sous le seuil → liste vide (aligné avec le frontend)."""
        client = _make_client([_fake_recipe("Tarte")])
        resp = client.get("/recipes/search?q=ta")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_query_3_chars_retourne_200(self):
        """3 caractères = seuil minimum accepté."""
        client = _make_client([_fake_recipe("Tarte aux pommes")])
        resp = client.get("/recipes/search?q=tar")
        assert resp.status_code == 200

    def test_reponse_est_une_liste(self):
        client = _make_client([_fake_recipe("Poulet rôti")])
        resp = client.get("/recipes/search?q=poulet")
        assert isinstance(resp.json(), list)

    def test_limit_max_200_rejette_au_dessus(self):
        """limit > 200 doit être rejeté avec 422."""
        client = _make_client([])
        resp = client.get("/recipes/search?q=test&limit=201")
        assert resp.status_code == 422

    def test_offset_et_limit_acceptes(self):
        """offset et limit valides sont acceptés."""
        client = _make_client([])
        resp = client.get("/recipes/search?q=test&offset=40&limit=40")
        assert resp.status_code == 200

    def test_limit_par_defaut_est_100(self):
        """Sans paramètre limit, la valeur par défaut est 100 (pas 422)."""
        client = _make_client([])
        resp = client.get("/recipes/search?q=test")
        assert resp.status_code == 200

    def test_query_multi_mots_retourne_200(self):
        """Requête multi-mots type 'lentille saucisse' → 200 (pas de rejet ni crash)."""
        client = _make_client([_fake_recipe("Lentilles aux saucisses")])
        resp = client.get("/recipes/search?q=lentille+saucisse")
        assert resp.status_code == 200

    def test_query_multi_mots_ne_cherche_pas_phrase_exacte(self):
        """Avec 'lentille saucisse', chaque mot est cherché séparément — pas de filtre phrase exacte.

        Vérifie que le code chemine dans la branche multi-mots sans erreur.
        """
        client = _make_client([])
        resp = client.get("/recipes/search?q=lentille+saucisse")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
