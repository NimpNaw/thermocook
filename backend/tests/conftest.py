"""Fixtures partagées : moteur SQLite en mémoire avec contraintes FK réelles.

Contrairement aux mocks `MagicMock`, ce moteur applique réellement les
contraintes de clés étrangères (PRAGMA foreign_keys=ON) — indispensable pour
détecter les suppressions dans le mauvais ordre (IntegrityError en prod
PostgreSQL, silencieux avec un mock).
"""
import os
import sys

import pytest
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    """Nettoie les dependency_overrides après CHAQUE test.

    Harmonisation : certains anciens fichiers (test_search.py,
    test_recipes_sort.py) posaient des overrides sans jamais les retirer —
    la fuite était masquée par les cleanups des autres fichiers.
    """
    yield
    from app.main import app
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _disable_rate_limiter():
    """GET /shared-list est limité à 5/minute — on désactive le limiteur pour
    éviter des 429 parasites entre tests (aucun test n'asserte de 429 ; un
    futur test 429 pourra le réactiver localement)."""
    from app.main import app
    previous = app.state.limiter.enabled
    app.state.limiter.enabled = False
    yield
    app.state.limiter.enabled = previous


@pytest.fixture()
def fk_engine():
    """Moteur SQLite en mémoire, FK activées, partageable entre threads (TestClient)."""
    # Import nécessaire pour que SQLModel.metadata connaisse toutes les tables
    import app.models  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_fk(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
        # Workaround documenté SQLAlchemy : le mode transactionnel par défaut de
        # pysqlite ne gère pas fidèlement les SAVEPOINT (begin_nested). On désactive
        # son émission implicite de BEGIN et on le gère nous-mêmes.
        dbapi_conn.isolation_level = None

    @event.listens_for(engine, "begin")
    def _do_begin(conn):
        conn.exec_driver_sql("BEGIN")

    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def fk_session(fk_engine):
    with Session(fk_engine) as session:
        yield session
