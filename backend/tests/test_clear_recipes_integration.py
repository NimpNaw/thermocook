"""Tests d'intégration pour POST /admin/clear-recipes avec une vraie base (FK actives).

Reproduit le bug : l'endpoint supprimait `Recipe` sans purger `RecipeIngredient`
au préalable ; la FK `recipeingredient.recipe_id` (sans ON DELETE CASCADE)
provoquait une IntegrityError → 500 dès qu'une recette avait des ingrédients,
c'est-à-dire quasi systématiquement en production. Les tests mockés de
test_clear_recipes.py ne pouvaient pas le détecter.
"""
import pathlib
import tempfile
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlmodel import select

from app.models import (
    IngredientRef,
    Recipe,
    RecipeIngredient,
    User,
    UserFavorite,
)


def _seed_recipe_with_ingredients(session):
    """Crée un utilisateur, une recette complète avec ingrédient normalisé et favori."""
    user = User(username="chef", hashed_password="x", is_admin=True)
    session.add(user)
    session.commit()
    session.refresh(user)

    recipe = Recipe(
        id="cmix_cookomix_tarte-aux-pommes",
        title="Tarte aux pommes",
        slug="tarte-aux-pommes",
        folder_name="cmix_cookomix/tarte-aux-pommes",
        content_md="# Tarte aux pommes",
    )
    ref = IngredientRef(name="pomme", slug="pomme")
    session.add(recipe)
    session.add(ref)
    session.commit()
    session.refresh(ref)

    session.add(
        RecipeIngredient(
            recipe_id=recipe.id,
            ingredient_ref_id=ref.id,
            quantity=500.0,
            unit="g",
            raw_text="500 g de pommes",
        )
    )
    session.add(UserFavorite(user_id=user.id, recipe_id=recipe.id))
    session.commit()


def _make_client(fk_engine):
    from app.main import app, get_session
    from app.auth import get_current_admin
    from sqlmodel import Session

    fake_admin = MagicMock()
    fake_admin.is_admin = True

    def override_session():
        with Session(fk_engine) as session:
            yield session

    app.dependency_overrides[get_current_admin] = lambda: fake_admin
    app.dependency_overrides[get_session] = override_session
    return TestClient(app, raise_server_exceptions=False)


def test_clear_recipes_avec_ingredients_normalises(fk_engine, fk_session):
    """Le cas production : les recettes ont des RecipeIngredient (FK sans cascade)."""
    _seed_recipe_with_ingredients(fk_session)

    client = _make_client(fk_engine)
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_thumbs = pathlib.Path(tmpdir) / "thumbs"
        fake_thumbs.mkdir()
        with patch("app.thumbs.THUMBS_DIR", fake_thumbs):
            try:
                resp = client.post("/admin/clear-recipes")
            finally:
                from app.main import app as _app
                _app.dependency_overrides.clear()

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 1}

    assert fk_session.exec(select(Recipe)).all() == []
    assert fk_session.exec(select(RecipeIngredient)).all() == []
    assert fk_session.exec(select(UserFavorite)).all() == []
    # Les IngredientRef, tous orphelins après purge, sont nettoyés aussi
    assert fk_session.exec(select(IngredientRef)).all() == []
    # L'utilisateur, lui, est conservé
    assert len(fk_session.exec(select(User)).all()) == 1
