"""Tests d'intégration du partage de liste de courses (FK réelles).

Couvre POST /shopping-list/share, GET /shared-list/{token} (valide, expiré,
introuvable, vide) et DELETE /shopping-list/share/{token}.
"""
import sys
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlmodel import Session, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import (  # noqa: E402
    IngredientRef,
    MealPlan,
    Recipe,
    RecipeIngredient,
    SharedLink,
    ShoppingListExclusion,
    User,
)


def _seed_owner_with_list(session):
    """Un utilisateur avec deux recettes en liste de courses, dont un ingrédient exclu."""
    owner = User(username="alice", hashed_password="x")
    session.add(owner)
    session.commit()
    session.refresh(owner)
    owner_id = owner.id

    farine = IngredientRef(name="farine", slug="farine", category="Épicerie")
    pomme = IngredientRef(name="pomme", slug="pomme", category="Fruits & Légumes")
    r1 = Recipe(id="r1", title="Tarte aux pommes", slug="tarte-aux-pommes", content_md="# Tarte")
    r2 = Recipe(id="r2", title="Crêpes", slug="crepes", content_md="# Crêpes")
    session.add_all([farine, pomme, r1, r2])
    session.commit()
    session.refresh(farine)
    session.refresh(pomme)

    session.add(RecipeIngredient(recipe_id="r1", ingredient_ref_id=pomme.id, quantity=500, unit="g", raw_text="500 g de pommes"))
    session.add(RecipeIngredient(recipe_id="r1", ingredient_ref_id=farine.id, quantity=200, unit="g", raw_text="200 g de farine"))
    session.add(RecipeIngredient(recipe_id="r2", ingredient_ref_id=farine.id, quantity=250, unit="g", raw_text="250 g de farine"))
    for rid in ("r1", "r2"):
        session.add(MealPlan(
            user_id=owner_id, recipe_id=rid,
            planned_date=datetime(2099, 12, 31, tzinfo=timezone.utc),
            meal_type="shopping_list",
        ))
    # Exclure la farine de r2
    session.add(ShoppingListExclusion(user_id=owner_id, recipe_id="r2", ingredient_raw="250 g de farine"))
    session.commit()
    return owner_id


def _make_client(fk_engine, user_id=None):
    from app.main import app, get_session
    from app.auth import get_current_user

    def override_session():
        with Session(fk_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    if user_id is not None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=user_id, username="alice")
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


# ── POST /shopping-list/share ────────────────────────────────────────────────

def test_share_cree_un_lien_valide_7_jours(fk_engine, fk_session):
    owner_id = _seed_owner_with_list(fk_session)
    client = _make_client(fk_engine, owner_id)
    try:
        resp = client.post("/shopping-list/share")
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body and body["token"]
    finally:
        _cleanup()

    link = fk_session.get(SharedLink, body["token"])
    assert link is not None
    assert link.user_id == owner_id
    expires = link.expires_at.replace(tzinfo=timezone.utc) if link.expires_at.tzinfo is None else link.expires_at
    delta = expires - datetime.now(timezone.utc)
    assert timedelta(days=6) < delta <= timedelta(days=7)


# ── GET /shared-list/{token} ─────────────────────────────────────────────────

def test_shared_list_token_inconnu_404(fk_engine):
    client = _make_client(fk_engine)
    try:
        resp = client.get("/shared-list/token-inexistant")
        assert resp.status_code == 404
    finally:
        _cleanup()


def test_shared_list_expiree_403(fk_engine, fk_session):
    owner_id = _seed_owner_with_list(fk_session)
    fk_session.add(SharedLink(
        id="tok-expire", user_id=owner_id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    ))
    fk_session.commit()

    client = _make_client(fk_engine)
    try:
        resp = client.get("/shared-list/tok-expire")
        assert resp.status_code == 403
        assert "expiré" in resp.json()["detail"]
    finally:
        _cleanup()


def test_shared_list_vide_retourne_structure_minimale(fk_engine, fk_session):
    """Propriétaire sans liste de courses : catégories et recettes vides."""
    owner = User(username="bob", hashed_password="x")
    fk_session.add(owner)
    fk_session.commit()
    fk_session.refresh(owner)
    fk_session.add(SharedLink(
        id="tok-vide", user_id=owner.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    ))
    fk_session.commit()

    client = _make_client(fk_engine)
    try:
        resp = client.get("/shared-list/tok-vide")
        assert resp.status_code == 200
        body = resp.json()
        assert body["categories"] == {}
        assert body["recipes"] == []
        assert body["owner"] == "bob"
    finally:
        _cleanup()


def test_shared_list_retourne_ingredients_groupes_et_exclusions(fk_engine, fk_session):
    """Accès anonyme : la liste du propriétaire est retournée, groupée par
    catégorie, en respectant ses exclusions."""
    owner_id = _seed_owner_with_list(fk_session)
    fk_session.add(SharedLink(
        id="tok-ok", user_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    ))
    fk_session.commit()

    client = _make_client(fk_engine)  # pas d'authentification : accès public
    try:
        resp = client.get("/shared-list/tok-ok")
        assert resp.status_code == 200
        body = resp.json()
        assert body["owner"] == "alice"
        assert {r["title"] for r in body["recipes"]} == {"Tarte aux pommes", "Crêpes"}

        categories = body["categories"]
        assert "Fruits & Légumes" in categories
        assert "Épicerie" in categories
        # La farine de r2 est exclue : seule celle de r1 (200 g) doit rester
        farine_items = [i for i in categories["Épicerie"] if "farine" in str(i).lower()]
        assert farine_items, "la farine de r1 doit être présente"
        assert "250" not in str(farine_items)
    finally:
        _cleanup()


# ── DELETE /shopping-list/share/{token} ──────────────────────────────────────

def test_revoke_share_link_supprime_le_lien(fk_engine, fk_session):
    owner_id = _seed_owner_with_list(fk_session)
    fk_session.add(SharedLink(
        id="tok-del", user_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    ))
    fk_session.commit()

    client = _make_client(fk_engine, owner_id)
    try:
        resp = client.delete("/shopping-list/share/tok-del")
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}
    finally:
        _cleanup()

    fk_session.expire_all()
    assert fk_session.get(SharedLink, "tok-del") is None


def test_revoke_share_link_d_un_autre_utilisateur_404(fk_engine, fk_session):
    owner_id = _seed_owner_with_list(fk_session)
    autre = User(username="mallory", hashed_password="x")
    fk_session.add(autre)
    fk_session.commit()
    fk_session.refresh(autre)
    autre_id = autre.id
    fk_session.add(SharedLink(
        id="tok-alice", user_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    ))
    fk_session.commit()

    client = _make_client(fk_engine, autre_id)
    try:
        resp = client.delete("/shopping-list/share/tok-alice")
        assert resp.status_code == 404
    finally:
        _cleanup()

    fk_session.expire_all()
    assert fk_session.get(SharedLink, "tok-alice") is not None  # le lien survit

    links = fk_session.exec(select(SharedLink)).all()
    assert len(links) == 1
