"""Tests pour la logique de saisonnalité (app/seasonal.py) et la route /recipes/seasonal."""
import sys
import os
from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import IngredientRef, Recipe, RecipeIngredient  # noqa: E402
from app.seasonal import SEASONAL_PRODUCE, get_current_seasonal_slugs  # noqa: E402


# ── Unité : get_current_seasonal_slugs ───────────────────────────────────────

def test_chaque_mois_a_des_produits_de_saison():
    """Les 12 mois de l'année ont tous une liste non vide de produits."""
    for mois in range(1, 13):
        slugs = get_current_seasonal_slugs(mois)
        assert slugs, f"le mois {mois} devrait avoir des produits de saison"
        assert slugs == SEASONAL_PRODUCE[mois]


def test_mois_courant_utilise_par_defaut():
    """Sans argument, la fonction utilise le mois courant."""
    assert get_current_seasonal_slugs() == SEASONAL_PRODUCE[datetime.now().month]


def test_mois_inconnu_retourne_liste_vide():
    """Un mois hors 1-12 retourne une liste vide (pas d'exception)."""
    assert get_current_seasonal_slugs(0) == []
    assert get_current_seasonal_slugs(13) == []


def test_janvier_contient_des_legumes_d_hiver():
    """Sanité : janvier contient poireau/carotte mais pas la tomate d'été."""
    slugs = get_current_seasonal_slugs(1)
    assert "poireau" in slugs
    assert "carotte" in slugs
    assert "tomate" not in slugs


# ── Intégration : GET /recipes/seasonal ──────────────────────────────────────

def _seed_recipes(session):
    """Deux recettes : une avec carotte (janvier), une avec chocolat (jamais de saison)."""
    carotte = IngredientRef(name="carotte", slug="carotte")
    chocolat = IngredientRef(name="chocolat", slug="chocolat")
    r1 = Recipe(id="r1", title="Soupe de carottes", slug="soupe-de-carottes", content_md="# Soupe")
    r2 = Recipe(id="r2", title="Mousse au chocolat", slug="mousse-au-chocolat", content_md="# Mousse")
    session.add(carotte)
    session.add(chocolat)
    session.add(r1)
    session.add(r2)
    session.commit()
    session.refresh(carotte)
    session.refresh(chocolat)
    session.add(RecipeIngredient(recipe_id="r1", ingredient_ref_id=carotte.id, raw_text="3 carottes"))
    session.add(RecipeIngredient(recipe_id="r2", ingredient_ref_id=chocolat.id, raw_text="200 g de chocolat"))
    session.commit()


def _make_client(fk_engine):
    from app.main import app, get_session

    def override_session():
        with Session(fk_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


def test_seasonal_filtre_par_ingredients_de_saison(fk_engine, fk_session):
    """En janvier, seule la recette contenant un ingrédient de saison est retournée."""
    _seed_recipes(fk_session)
    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes/seasonal", params={"month": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert [r["id"] for r in data] == ["r1"]
        assert data[0]["title"] == "Soupe de carottes"
    finally:
        _cleanup()


def test_seasonal_fallback_random_si_aucun_ingredient_connu(fk_engine, fk_session):
    """Si aucun IngredientRef ne correspond aux slugs de saison, fallback aléatoire."""
    # Seed sans aucun ingrédient de saison (uniquement du chocolat)
    chocolat = IngredientRef(name="chocolat", slug="chocolat")
    r2 = Recipe(id="r2", title="Mousse au chocolat", slug="mousse-au-chocolat", content_md="# Mousse")
    fk_session.add(chocolat)
    fk_session.add(r2)
    fk_session.commit()
    fk_session.refresh(chocolat)
    fk_session.add(RecipeIngredient(recipe_id="r2", ingredient_ref_id=chocolat.id, raw_text="200 g de chocolat"))
    fk_session.commit()

    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes/seasonal", params={"month": 1})
        assert resp.status_code == 200
        # Le fallback aléatoire retourne quand même les recettes disponibles
        assert [r["id"] for r in resp.json()] == ["r2"]
    finally:
        _cleanup()


def test_seasonal_fallback_random_si_mois_sans_produits(fk_session):
    """Appel direct avec un mois invalide (13) : liste de saison vide → fallback aléatoire."""
    from app.main import get_seasonal_recipes

    _seed_recipes(fk_session)
    rows = get_seasonal_recipes(offset=0, limit=6, month=13, session=fk_session)
    assert len(rows) == 2  # toutes les recettes, pas de filtre saisonnier


def test_seasonal_respecte_la_limite(fk_engine, fk_session):
    """Le paramètre limit est appliqué au résultat."""
    _seed_recipes(fk_session)
    # Ajouter une 2e recette de saison (poireau, janvier)
    poireau = IngredientRef(name="poireau", slug="poireau")
    r3 = Recipe(id="r3", title="Fondue de poireaux", slug="fondue-de-poireaux", content_md="# Fondue")
    fk_session.add(poireau)
    fk_session.add(r3)
    fk_session.commit()
    fk_session.refresh(poireau)
    fk_session.add(RecipeIngredient(recipe_id="r3", ingredient_ref_id=poireau.id, raw_text="2 poireaux"))
    fk_session.commit()

    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes/seasonal", params={"month": 1, "limit": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] in {"r1", "r3"}
    finally:
        _cleanup()
