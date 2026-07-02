"""Tests d'intégration des routes admin de gestion des utilisateurs (FK réelles).

Couvre /admin/stats, /admin/users (GET/POST), /admin/users/{id}/password et
DELETE /admin/users/{id} — y compris le nettoyage explicite des dépendances
(favoris, notes, exclusions, liens partagés, MealPlan, recettes possédées)
qui déclencherait une IntegrityError avec des FK réelles s'il était omis.
"""
import sys
import os
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlmodel import Session, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import (  # noqa: E402
    MealPlan,
    Recipe,
    SharedLink,
    ShoppingListExclusion,
    User,
    UserFavorite,
    UserRecipeNote,
)


def _make_admin_client(fk_engine, admin_id=1):
    from app.main import app, get_session
    from app.auth import get_current_admin

    def override_session():
        with Session(fk_engine) as session:
            yield session

    fake_admin = SimpleNamespace(id=admin_id, username="root", is_admin=True)
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_admin] = lambda: fake_admin
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


def _seed_admin(session) -> int:
    admin = User(username="root", hashed_password="x", is_admin=True)
    session.add(admin)
    session.commit()
    session.refresh(admin)
    admin_id = admin.id
    # Referme la transaction ouverte par le refresh : la connexion SQLite est
    # partagée (StaticPool) et un BEGIN résiduel ferait échouer la requête HTTP.
    session.commit()
    return admin_id


# ── Contrôle d'accès ─────────────────────────────────────────────────────────

def test_admin_stats_sans_auth_retourne_401(fk_engine):
    client = _make_admin_client(fk_engine)
    from app.main import app
    from app.auth import get_current_admin
    # Retirer l'override admin pour tester la vraie chaîne d'auth (pas de cookie)
    del app.dependency_overrides[get_current_admin]
    try:
        resp = client.get("/admin/stats")
        assert resp.status_code == 401
    finally:
        _cleanup()


def test_admin_stats_utilisateur_non_admin_retourne_403(fk_engine, fk_session):
    """Un utilisateur connecté mais non admin est refusé (403)."""
    from app.main import app
    from app.auth import get_current_admin, get_current_user

    user = User(username="bob", hashed_password="x", is_admin=False)
    fk_session.add(user)
    fk_session.commit()
    fk_session.refresh(user)
    bob = SimpleNamespace(id=user.id, username="bob", is_admin=False)

    client = _make_admin_client(fk_engine)
    del app.dependency_overrides[get_current_admin]
    app.dependency_overrides[get_current_user] = lambda: bob
    try:
        resp = client.get("/admin/stats")
        assert resp.status_code == 403
        assert "administrateurs" in resp.json()["detail"]
    finally:
        _cleanup()


# ── GET /admin/stats ─────────────────────────────────────────────────────────

def test_admin_stats_retourne_les_compteurs(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    recipe = Recipe(id="r1", title="Tarte", slug="tarte", content_md="# Tarte")
    fk_session.add(recipe)
    fk_session.commit()
    fk_session.add(UserFavorite(user_id=admin_id, recipe_id="r1"))
    fk_session.add(UserRecipeNote(user_id=admin_id, recipe_id="r1", note="Excellent"))
    fk_session.commit()

    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.get("/admin/stats")
        assert resp.status_code == 200
        assert resp.json() == {"recipes": 1, "users": 1, "favorites": 1, "notes": 1}
    finally:
        _cleanup()


# ── POST /admin/users ────────────────────────────────────────────────────────

def test_create_user_admin_cree_l_utilisateur(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.post("/admin/users", json={"username": "alice", "password": "secret123", "is_admin": False})
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "alice"
        assert body["is_admin"] is False

        created = fk_session.exec(select(User).where(User.username == "alice")).first()
        assert created is not None
        assert created.hashed_password != "secret123"  # le mot de passe est haché
    finally:
        _cleanup()


def test_create_user_admin_refuse_doublon(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.post("/admin/users", json={"username": "root", "password": "secret123"})
        assert resp.status_code == 400
        assert "déjà utilisé" in resp.json()["detail"]
    finally:
        _cleanup()


# ── GET /admin/users ─────────────────────────────────────────────────────────

def test_list_users_retourne_tous_les_utilisateurs(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    fk_session.add(User(username="alice", hashed_password="x"))
    fk_session.commit()

    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.get("/admin/users")
        assert resp.status_code == 200
        usernames = {u["username"] for u in resp.json()}
        assert usernames == {"root", "alice"}
    finally:
        _cleanup()


# ── PATCH /admin/users/{id}/password ─────────────────────────────────────────

def test_change_password_admin_modifie_le_hash(fk_engine, fk_session):
    from app.auth import verify_password

    admin_id = _seed_admin(fk_session)
    user = User(username="alice", hashed_password="ancien-hash")
    fk_session.add(user)
    fk_session.commit()
    fk_session.refresh(user)
    user_id = user.id
    fk_session.commit()  # referme la transaction ouverte par le refresh

    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.patch(f"/admin/users/{user_id}/password", json={"new_password": "nouveau-pass"})
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}

        fk_session.expire_all()
        updated = fk_session.get(User, user_id)
        assert updated.hashed_password != "ancien-hash"
        assert verify_password("nouveau-pass", updated.hashed_password)
    finally:
        _cleanup()


def test_change_password_admin_utilisateur_inconnu_404(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.patch("/admin/users/9999/password", json={"new_password": "nouveau-pass"})
        assert resp.status_code == 404
    finally:
        _cleanup()


# ── DELETE /admin/users/{id} ─────────────────────────────────────────────────

def test_delete_user_refuse_l_autosuppression(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.delete(f"/admin/users/{admin_id}")
        assert resp.status_code == 400
        assert "propre compte" in resp.json()["detail"]
        assert fk_session.get(User, admin_id) is not None
    finally:
        _cleanup()


def test_delete_user_inconnu_retourne_404(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.delete("/admin/users/9999")
        assert resp.status_code == 404
    finally:
        _cleanup()


def test_delete_user_refuse_un_autre_admin(fk_engine, fk_session):
    admin_id = _seed_admin(fk_session)
    other_admin = User(username="root2", hashed_password="x", is_admin=True)
    fk_session.add(other_admin)
    fk_session.commit()
    fk_session.refresh(other_admin)
    other_id = other_admin.id
    fk_session.commit()  # referme la transaction ouverte par le refresh

    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.delete(f"/admin/users/{other_id}")
        assert resp.status_code == 400
        assert "administrateur" in resp.json()["detail"]
        assert fk_session.get(User, other_id) is not None
    finally:
        _cleanup()


def test_delete_user_nettoie_toutes_les_dependances(fk_engine, fk_session):
    """Suppression d'un utilisateur avec favoris, notes, exclusions, lien partagé,
    MealPlan et recette possédée — le cas qui casserait avec des FK réelles."""
    admin_id = _seed_admin(fk_session)
    bob = User(username="bob", hashed_password="x")
    recipe = Recipe(id="r1", title="Tarte", slug="tarte", content_md="# Tarte")
    fk_session.add(bob)
    fk_session.add(recipe)
    fk_session.commit()
    fk_session.refresh(bob)
    bob_id = bob.id

    recipe.owner_id = bob_id
    fk_session.add(UserFavorite(user_id=bob_id, recipe_id="r1"))
    fk_session.add(UserRecipeNote(user_id=bob_id, recipe_id="r1", note="Miam"))
    fk_session.add(ShoppingListExclusion(user_id=bob_id, recipe_id="r1", ingredient_raw="sel"))
    fk_session.add(SharedLink(id="tok-bob", user_id=bob_id, expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc)))
    fk_session.add(MealPlan(user_id=bob_id, recipe_id="r1", planned_date=datetime(2099, 1, 1, tzinfo=timezone.utc), meal_type="shopping_list"))
    fk_session.commit()

    client = _make_admin_client(fk_engine, admin_id)
    try:
        resp = client.delete(f"/admin/users/{bob_id}")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"status": "success"}
    finally:
        _cleanup()

    fk_session.expire_all()
    assert fk_session.get(User, bob_id) is None
    assert fk_session.exec(select(UserFavorite)).all() == []
    assert fk_session.exec(select(UserRecipeNote)).all() == []
    assert fk_session.exec(select(ShoppingListExclusion)).all() == []
    assert fk_session.exec(select(SharedLink)).all() == []
    assert fk_session.exec(select(MealPlan)).all() == []
    # La recette est conservée mais orpheline
    kept = fk_session.get(Recipe, "r1")
    assert kept is not None
    assert kept.owner_id is None
