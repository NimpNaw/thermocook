"""Tests d'intégration des routes générales de main.py (base FK réelle).

Couvre /, /health, /register, /users/me, /recipes/random, /recipes (filtres),
/recipes/bulk, /shopping-list/exclude et le 404 de /shopping-list/add.
"""
import sys
import os
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlmodel import Session, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import Recipe, ShoppingListExclusion, User  # noqa: E402


def _make_client(fk_engine, user_id=None):
    from app.main import app, get_session
    from app.auth import get_current_user

    def override_session():
        with Session(fk_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    if user_id is not None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=user_id, username="alice", is_active=True, is_admin=False,
            created_at=__import__("datetime").datetime(2024, 1, 1),
        )
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


def _seed_recipes(session):
    session.add(Recipe(id="r1", title="Tarte aux pommes", slug="tarte-aux-pommes",
                       content_md="# Tarte", difficulty="Facile", total_time=1800, category="Dessert"))
    session.add(Recipe(id="r2", title="Boeuf bourguignon", slug="boeuf-bourguignon",
                       content_md="# Boeuf", difficulty="Difficile", total_time=10800, category="Plat principal"))
    session.commit()


# ── Racine et santé ──────────────────────────────────────────────────────────

def test_read_root_retourne_status_online(fk_engine):
    client = _make_client(fk_engine)
    try:
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "online"
    finally:
        _cleanup()


def test_health_check_ok(fk_engine):
    client = _make_client(fk_engine)
    try:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
    finally:
        _cleanup()


# ── /register ────────────────────────────────────────────────────────────────

def test_register_cree_un_utilisateur_avec_mot_de_passe_hache(fk_engine, fk_session):
    from app.auth import verify_password

    client = _make_client(fk_engine)
    try:
        resp = client.post("/register", json={"username": "nouvel", "password": "motdepasse"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "nouvel"
        assert body["is_admin"] is False
        assert "hashed_password" not in body
    finally:
        _cleanup()

    user = fk_session.exec(select(User).where(User.username == "nouvel")).one()
    assert user.hashed_password != "motdepasse"
    assert verify_password("motdepasse", user.hashed_password)


def test_register_refuse_un_nom_deja_pris(fk_engine, fk_session):
    fk_session.add(User(username="nouvel", hashed_password="x"))
    fk_session.commit()

    client = _make_client(fk_engine)
    try:
        resp = client.post("/register", json={"username": "nouvel", "password": "motdepasse"})
        assert resp.status_code == 400
        assert "déjà utilisé" in resp.json()["detail"]
    finally:
        _cleanup()

    assert len(fk_session.exec(select(User)).all()) == 1


# ── /users/me ────────────────────────────────────────────────────────────────

def test_users_me_retourne_l_utilisateur_connecte(fk_engine):
    client = _make_client(fk_engine, user_id=7)
    try:
        resp = client.get("/users/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 7
        assert body["username"] == "alice"
    finally:
        _cleanup()


def test_users_me_sans_auth_401(fk_engine):
    client = _make_client(fk_engine)
    try:
        assert client.get("/users/me").status_code == 401
    finally:
        _cleanup()


# ── /recipes/random ──────────────────────────────────────────────────────────

def test_recipes_random_retourne_des_previews(fk_engine, fk_session):
    _seed_recipes(fk_session)
    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes/random", params={"limit": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] in {"r1", "r2"}
        assert "content_md" not in data[0]  # version allégée
    finally:
        _cleanup()


# ── /recipes : filtres ───────────────────────────────────────────────────────

def test_list_recipes_filtre_max_time(fk_engine, fk_session):
    _seed_recipes(fk_session)
    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes", params={"max_time": 3600})
        assert resp.status_code == 200
        assert [r["id"] for r in resp.json()] == ["r1"]
    finally:
        _cleanup()


def test_list_recipes_filtre_difficulte(fk_engine, fk_session):
    _seed_recipes(fk_session)
    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes", params={"difficulty": "Difficile"})
        assert resp.status_code == 200
        assert [r["id"] for r in resp.json()] == ["r2"]
    finally:
        _cleanup()


def test_list_recipes_filtre_categorie(fk_engine, fk_session):
    _seed_recipes(fk_session)
    client = _make_client(fk_engine)
    try:
        resp = client.get("/recipes", params={"category": "Plat principal"})
        assert resp.status_code == 200
        assert [r["id"] for r in resp.json()] == ["r2"]
    finally:
        _cleanup()


# ── /recipes/bulk ────────────────────────────────────────────────────────────

def test_recipes_bulk_retourne_les_recettes_demandees(fk_engine, fk_session):
    _seed_recipes(fk_session)
    client = _make_client(fk_engine)
    try:
        resp = client.post("/recipes/bulk", json={"recipe_ids": ["r1", "inconnu"]})
        assert resp.status_code == 200
        data = resp.json()
        assert [r["id"] for r in data] == ["r1"]
        assert data[0]["content_md"] == "# Tarte"
    finally:
        _cleanup()


def test_recipes_bulk_liste_vide_retourne_liste_vide(fk_engine):
    client = _make_client(fk_engine)
    try:
        resp = client.post("/recipes/bulk", json={"recipe_ids": []})
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        _cleanup()


# ── /shopping-list/add et /shopping-list/exclude ─────────────────────────────

def _seed_user(session) -> int:
    user = User(username="alice", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    # Referme la transaction ouverte par le refresh : la connexion SQLite est
    # partagée (StaticPool) et un BEGIN résiduel ferait échouer la requête HTTP.
    session.commit()
    return user_id


def test_add_to_shopping_list_recette_inconnue_404(fk_engine, fk_session):
    user_id = _seed_user(fk_session)
    client = _make_client(fk_engine, user_id)
    try:
        resp = client.post("/shopping-list/add", json={"recipe_id": "inconnu"})
        assert resp.status_code == 404
    finally:
        _cleanup()


def test_exclude_ingredient_cree_l_exclusion(fk_engine, fk_session):
    user_id = _seed_user(fk_session)
    _seed_recipes(fk_session)
    client = _make_client(fk_engine, user_id)
    try:
        resp = client.post("/shopping-list/exclude",
                           json={"recipe_id": "r1", "ingredient_raw": "  200 g de farine  "})
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}
    finally:
        _cleanup()

    exclusion = fk_session.exec(select(ShoppingListExclusion)).one()
    assert exclusion.recipe_id == "r1"
    assert exclusion.ingredient_raw == "200 g de farine"  # trim appliqué


def test_exclude_ingredient_idempotent(fk_engine, fk_session):
    """Exclure deux fois le même ingrédient ne crée pas de doublon."""
    user_id = _seed_user(fk_session)
    _seed_recipes(fk_session)
    client = _make_client(fk_engine, user_id)
    try:
        for _ in range(2):
            resp = client.post("/shopping-list/exclude",
                               json={"recipe_id": "r1", "ingredient_raw": "sel"})
            assert resp.status_code == 200
    finally:
        _cleanup()

    assert len(fk_session.exec(select(ShoppingListExclusion)).all()) == 1


def test_exclude_ingredient_recette_inconnue_404(fk_engine, fk_session):
    user_id = _seed_user(fk_session)
    client = _make_client(fk_engine, user_id)
    try:
        resp = client.post("/shopping-list/exclude",
                           json={"recipe_id": "inconnu", "ingredient_raw": "sel"})
        assert resp.status_code == 404
    finally:
        _cleanup()
