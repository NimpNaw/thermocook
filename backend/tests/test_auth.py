# backend/tests/test_auth.py
"""Tests unitaires pour auth.py — fonctions pures (pas de DB)."""
import os
import sys
from datetime import timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SECRET_KEY", "test-secret-key-pour-tests-unitaires")


def test_get_password_hash_returns_non_empty():
    from app.auth import get_password_hash
    hashed = get_password_hash("monmotdepasse")
    assert hashed
    assert hashed != "monmotdepasse"


def test_verify_password_correct():
    from app.auth import get_password_hash, verify_password
    hashed = get_password_hash("monmotdepasse")
    assert verify_password("monmotdepasse", hashed) is True


def test_verify_password_wrong():
    from app.auth import get_password_hash, verify_password
    hashed = get_password_hash("monmotdepasse")
    assert verify_password("mauvais", hashed) is False


def test_create_access_token_contains_sub():
    from app import auth
    from jose import jwt
    token = auth.create_access_token({"sub": "alice"})
    payload = jwt.decode(token, auth.SECRET_KEY, algorithms=["HS256"])
    assert payload["sub"] == "alice"


def test_create_access_token_has_exp():
    from app import auth
    from jose import jwt
    token = auth.create_access_token({"sub": "alice"})
    payload = jwt.decode(token, auth.SECRET_KEY, algorithms=["HS256"])
    assert "exp" in payload


def test_create_access_token_custom_expiry():
    from app import auth
    from jose import jwt
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    token = auth.create_access_token({"sub": "alice"}, expires_delta=timedelta(minutes=5))
    payload = jwt.decode(token, auth.SECRET_KEY, algorithms=["HS256"])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    diff_minutes = (exp - now).total_seconds() / 60
    assert 3 < diff_minutes <= 6


def test_create_access_token_default_expiry_is_not_zero():
    from app import auth
    from jose import jwt
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    token = auth.create_access_token({"sub": "alice"})
    payload = jwt.decode(token, auth.SECRET_KEY, algorithms=["HS256"])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    diff_minutes = (exp - now).total_seconds() / 60
    # create_access_token sans expires_delta utilise timedelta(minutes=15) par défaut
    assert diff_minutes > 10


# ── get_current_user via cookie ────────────────────────────────────────────────

def test_get_current_user_no_cookie_raises_401():
    """401 si aucun cookie access_token."""
    import asyncio
    from app.auth import get_current_user
    from fastapi import HTTPException
    from unittest.mock import MagicMock

    mock_request = MagicMock()
    mock_request.cookies.get.return_value = None
    mock_session = MagicMock()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(mock_request, mock_session))
    assert exc.value.status_code == 401


def test_get_current_user_invalid_cookie_raises_401():
    """401 si cookie invalide (JWT corrompu)."""
    import asyncio
    from app.auth import get_current_user
    from fastapi import HTTPException
    from unittest.mock import MagicMock

    mock_request = MagicMock()
    mock_request.cookies.get.return_value = "not-a-valid-jwt"
    mock_session = MagicMock()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(mock_request, mock_session))
    assert exc.value.status_code == 401


def test_get_current_user_valid_cookie_returns_user():
    """Retourne l'utilisateur si cookie valide."""
    import asyncio
    from app import auth
    from unittest.mock import MagicMock

    token = auth.create_access_token({"sub": "alice"})

    mock_request = MagicMock()
    mock_request.cookies.get.return_value = token

    fake_user = MagicMock()
    fake_user.username = "alice"
    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = fake_user

    result = asyncio.run(auth.get_current_user(mock_request, mock_session))
    assert result is fake_user


def test_get_current_user_user_not_found_raises_401():
    """401 si le user du token n'existe plus en base."""
    import asyncio
    from app import auth
    from fastapi import HTTPException
    from unittest.mock import MagicMock

    token = auth.create_access_token({"sub": "ghost"})

    mock_request = MagicMock()
    mock_request.cookies.get.return_value = token
    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = None  # user introuvable

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.get_current_user(mock_request, mock_session))
    assert exc.value.status_code == 401
