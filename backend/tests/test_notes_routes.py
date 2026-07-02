"""Tests des routes de notes personnelles (GET/POST /recipes/{id}/notes)."""
import sys
import os
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import Recipe, User, UserRecipeNote  # noqa: E402


def _seed_user_and_recipe(session):
    user = User(username="alice", hashed_password="x")
    recipe = Recipe(id="r1", title="Tarte", slug="tarte", content_md="# Tarte")
    session.add(user)
    session.add(recipe)
    session.commit()
    session.refresh(user)
    user_id = user.id
    # Referme la transaction ouverte par le refresh : la connexion SQLite est
    # partagée (StaticPool) et un BEGIN résiduel ferait échouer la requête HTTP.
    session.commit()
    return user_id


def _make_client(fk_engine, user_id):
    from app.main import app, get_session
    from app.auth import get_current_user

    def override_session():
        with Session(fk_engine) as session:
            yield session

    fake_user = SimpleNamespace(id=user_id, username="alice", is_admin=False)
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: fake_user
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    from app.main import app
    app.dependency_overrides.clear()


def test_get_note_inexistante_retourne_chaine_vide(fk_engine, fk_session):
    user_id = _seed_user_and_recipe(fk_session)
    client = _make_client(fk_engine, user_id)
    try:
        resp = client.get("/recipes/r1/notes")
        assert resp.status_code == 200
        assert resp.json() == {"note": ""}
    finally:
        _cleanup()


def test_add_note_cree_puis_get_la_retourne(fk_engine, fk_session):
    user_id = _seed_user_and_recipe(fk_session)
    client = _make_client(fk_engine, user_id)
    try:
        resp = client.post("/recipes/r1/notes", json={"note_text": "Doubler le sucre"})
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}

        resp = client.get("/recipes/r1/notes")
        assert resp.json() == {"note": "Doubler le sucre"}
    finally:
        _cleanup()

    note = fk_session.exec(select(UserRecipeNote)).one()
    assert note.user_id == user_id
    assert note.recipe_id == "r1"
    assert note.note == "Doubler le sucre"


def test_add_note_modifie_la_note_existante(fk_engine, fk_session):
    user_id = _seed_user_and_recipe(fk_session)
    fk_session.add(UserRecipeNote(
        user_id=user_id, recipe_id="r1", note="Version 1",
        updated_at=datetime(2024, 1, 1),
    ))
    fk_session.commit()

    client = _make_client(fk_engine, user_id)
    try:
        resp = client.post("/recipes/r1/notes", json={"note_text": "Version 2"})
        assert resp.status_code == 200
    finally:
        _cleanup()

    fk_session.expire_all()
    notes = fk_session.exec(select(UserRecipeNote)).all()
    assert len(notes) == 1  # pas de doublon (contrainte unique user/recipe)
    assert notes[0].note == "Version 2"
    assert notes[0].updated_at > datetime(2024, 1, 1)


def test_add_note_sans_auth_retourne_401(fk_engine, fk_session):
    _seed_user_and_recipe(fk_session)
    from app.main import app, get_session

    def override_session():
        with Session(fk_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.post("/recipes/r1/notes", json={"note_text": "x"})
        assert resp.status_code == 401
    finally:
        _cleanup()


def test_add_note_race_condition_bascule_en_update():
    """Si l'INSERT échoue (note créée concurremment entre le SELECT et le commit),
    la route rollback puis met à jour la note existante."""
    from app.main import app, get_session
    from app.auth import get_current_user

    concurrent_note = MagicMock(spec=UserRecipeNote)
    concurrent_note.note = "note concurrente"

    mock_session = MagicMock()
    # 1er exec (SELECT initial) → aucune note ; 2e exec (après rollback) → note concurrente
    first_result = MagicMock()
    first_result.first.return_value = None
    second_result = MagicMock()
    second_result.first.return_value = concurrent_note
    mock_session.exec.side_effect = [first_result, second_result]
    # 1er commit → IntegrityError (violation de la contrainte unique) ; 2e → OK
    mock_session.commit.side_effect = [IntegrityError("INSERT", {}, Exception("uq")), None]

    def override_session():
        yield mock_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, username="alice")

    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.post("/recipes/r1/notes", json={"note_text": "ma version"})
        assert resp.status_code == 200
        assert resp.json() == {"status": "success"}
        mock_session.rollback.assert_called_once()
        # La note concurrente a été mise à jour avec le texte de la requête
        assert concurrent_note.note == "ma version"
        assert mock_session.commit.call_count == 2
    finally:
        _cleanup()
