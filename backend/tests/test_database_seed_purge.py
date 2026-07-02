"""Tests de _seed_admin et purge_db (app/database.py) avec une vraie base FK."""
import sys
import os
from datetime import datetime, timezone

from sqlmodel import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import (  # noqa: E402
    ImportLog,
    IngredientRef,
    MealPlan,
    Recipe,
    RecipeIngredient,
    ShoppingListExclusion,
    User,
    UserFavorite,
    UserRecipeNote,
)


# ── _seed_admin ──────────────────────────────────────────────────────────────

def test_seed_admin_cree_le_compte_depuis_l_environnement(fk_session, monkeypatch):
    from app.auth import verify_password
    from app.database import _seed_admin

    monkeypatch.setenv("ADMIN_USERNAME", "boss")
    monkeypatch.setenv("ADMIN_PASSWORD", "s3cret-boss")

    _seed_admin(fk_session)

    admin = fk_session.exec(select(User).where(User.username == "boss")).one()
    assert admin.is_admin is True
    assert admin.is_active is True
    assert verify_password("s3cret-boss", admin.hashed_password)


def test_seed_admin_met_a_jour_le_compte_existant(fk_session, monkeypatch):
    """Un compte existant est promu admin, réactivé et son mot de passe resynchronisé."""
    from app.auth import verify_password
    from app.database import _seed_admin

    monkeypatch.setenv("ADMIN_USERNAME", "boss")
    monkeypatch.setenv("ADMIN_PASSWORD", "nouveau-pass")

    fk_session.add(User(username="boss", hashed_password="vieux-hash", is_admin=False, is_active=False))
    fk_session.commit()

    _seed_admin(fk_session)

    users = fk_session.exec(select(User).where(User.username == "boss")).all()
    assert len(users) == 1  # mise à jour, pas de doublon
    admin = users[0]
    assert admin.is_admin is True
    assert admin.is_active is True
    assert verify_password("nouveau-pass", admin.hashed_password)


def test_seed_admin_valeurs_par_defaut(fk_session, monkeypatch):
    """Sans variables d'environnement : compte 'admin' / 'changeme'."""
    from app.auth import verify_password
    from app.database import _seed_admin

    monkeypatch.delenv("ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    _seed_admin(fk_session)

    admin = fk_session.exec(select(User).where(User.username == "admin")).one()
    assert admin.is_admin is True
    assert verify_password("changeme", admin.hashed_password)


# ── purge_db ─────────────────────────────────────────────────────────────────

def test_purge_db_vide_les_tables_recettes_mais_conserve_les_utilisateurs(fk_engine, fk_session, monkeypatch):
    import app.database as database

    # purge_db utilise le moteur global du module → on le remplace par le moteur de test
    monkeypatch.setattr(database, "engine", fk_engine)

    user = User(username="alice", hashed_password="x")
    recipe = Recipe(id="r1", title="Tarte", slug="tarte", content_md="# Tarte")
    ref = IngredientRef(name="pomme", slug="pomme")
    fk_session.add_all([user, recipe, ref])
    fk_session.commit()
    fk_session.refresh(user)
    fk_session.refresh(ref)

    fk_session.add(RecipeIngredient(recipe_id="r1", ingredient_ref_id=ref.id, raw_text="3 pommes"))
    fk_session.add(UserFavorite(user_id=user.id, recipe_id="r1"))
    fk_session.add(UserRecipeNote(user_id=user.id, recipe_id="r1", note="Miam"))
    fk_session.add(ShoppingListExclusion(user_id=user.id, recipe_id="r1", ingredient_raw="sel"))
    fk_session.add(MealPlan(user_id=user.id, recipe_id="r1",
                            planned_date=datetime(2099, 12, 31, tzinfo=timezone.utc),
                            meal_type="shopping_list"))
    fk_session.add(ImportLog(source="a", error="e"))
    fk_session.commit()

    database.purge_db()

    fk_session.expire_all()
    assert fk_session.exec(select(Recipe)).all() == []
    assert fk_session.exec(select(RecipeIngredient)).all() == []
    assert fk_session.exec(select(IngredientRef)).all() == []
    assert fk_session.exec(select(UserFavorite)).all() == []
    assert fk_session.exec(select(UserRecipeNote)).all() == []
    assert fk_session.exec(select(ShoppingListExclusion)).all() == []
    assert fk_session.exec(select(MealPlan)).all() == []
    # Les utilisateurs et les logs d'import survivent à la purge
    assert len(fk_session.exec(select(User)).all()) == 1
    assert len(fk_session.exec(select(ImportLog)).all()) == 1


def test_purge_db_sur_base_vide_ne_leve_pas(fk_engine, monkeypatch):
    import app.database as database

    monkeypatch.setattr(database, "engine", fk_engine)
    database.purge_db()  # aucune exception attendue
