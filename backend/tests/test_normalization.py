# backend/tests/test_normalization.py
"""Tests unitaires pour normalization.py — fonctions pures (sans DB)."""
import os
import sys
from unittest.mock import MagicMock, patch


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── clean_ingredient_name ──────────────────────────────────────────────────────

def test_clean_removes_parentheses():
    from app.normalization import clean_ingredient_name
    assert clean_ingredient_name("farine (tamisée)") == "farine"


def test_clean_removes_articles():
    from app.normalization import clean_ingredient_name
    assert clean_ingredient_name("du beurre") == "beurre"


def test_clean_removes_prep_words():
    from app.normalization import clean_ingredient_name
    result = clean_ingredient_name("poulet haché")
    assert "haché" not in result


def test_clean_lowercases():
    from app.normalization import clean_ingredient_name
    assert clean_ingredient_name("FARINE") == "farine"


# ── parse_quantity_and_unit ────────────────────────────────────────────────────

def test_parse_grams():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("200 g farine")
    assert qty == 200
    assert unit == "g"
    assert name == "farine"


def test_parse_kilograms():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("1 kg pommes de terre")
    assert qty == 1
    assert unit == "kg"
    assert "pomme" in name


def test_parse_no_unit():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("3 oeufs")
    assert qty == 3
    assert unit is None
    assert "oeuf" in name


def test_parse_cuillere_a_soupe():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("2 c. à soupe huile")
    assert qty == 2
    assert unit == "c. à soupe"
    assert "huile" in name


def test_parse_no_quantity():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("sel")
    assert qty == 0.0
    assert unit is None
    assert "sel" in name


def test_parse_qs_prefix():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("QS sel")
    assert "sel" in name


def test_parse_decimal_quantity():
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("1,5 l lait")
    assert qty == 1.5
    assert unit == "l"
    assert "lait" in name


# ── _detect_egg_type ───────────────────────────────────────────────────────────

def test_detect_egg_whole():
    from app.normalization import _detect_egg_type
    assert _detect_egg_type("Oeuf") == "whole"


def test_detect_egg_yolk():
    from app.normalization import _detect_egg_type
    assert _detect_egg_type("Jaune d'oeuf") == "yolk"


def test_detect_egg_white():
    from app.normalization import _detect_egg_type
    assert _detect_egg_type("Blanc d'oeuf") == "white"


def test_detect_egg_none():
    from app.normalization import _detect_egg_type
    assert _detect_egg_type("farine") is None


def test_detect_egg_unicode():
    from app.normalization import _detect_egg_type
    assert _detect_egg_type("œuf entier") == "whole"


# ── get_or_create_ingredient_ref (avec mock session) ──────────────────────────

def test_get_or_create_returns_none_for_utensil():
    from app.normalization import get_or_create_ingredient_ref
    mock_session = MagicMock()
    result = get_or_create_ingredient_ref(mock_session, "fouet")
    assert result is None


def test_get_or_create_creates_new_with_category():
    from app.normalization import get_or_create_ingredient_ref
    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = None  # pas en base

    result = get_or_create_ingredient_ref(mock_session, "farine")
    assert result.name == "Farine"
    assert result.category == "Épicerie"


def test_get_or_create_default_category_divers():
    from app.normalization import get_or_create_ingredient_ref
    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = None

    result = get_or_create_ingredient_ref(mock_session, "truc inconnu")
    assert result.category == "Divers"


# ── process_recipe_ingredients ────────────────────────────────────────────────

def test_process_recipe_ingredients_adds_to_session():
    from app.normalization import process_recipe_ingredients
    mock_session = MagicMock()
    # Simuler un IngredientRef créé
    fake_ref = MagicMock()
    fake_ref.id = 42

    mock_recipe = MagicMock()
    mock_recipe.id = "r123"
    mock_recipe.content_md = "## Ingrédients\n\n- 200 g farine\n\n## Préparation"

    with patch("app.normalization.get_or_create_ingredient_ref", return_value=fake_ref):
        process_recipe_ingredients(mock_session, mock_recipe)
    
    # On vérifie que session.add a été appelé (une fois pour l'ingrédient)
    mock_session.add.assert_called()


def test_process_recipe_ingredients_accumulates_duplicates():
    from app.normalization import process_recipe_ingredients
    mock_session = MagicMock()
    fake_ref = MagicMock()
    fake_ref.id = 1

    added_items = []
    mock_session.add.side_effect = lambda x: added_items.append(x)

    mock_recipe = MagicMock()
    mock_recipe.id = "r123"
    mock_recipe.content_md = "## Ingrédients\n\n- 200 g farine\n- 100 g farine\n\n## Préparation"

    with patch("app.normalization.get_or_create_ingredient_ref", return_value=fake_ref):
        process_recipe_ingredients(mock_session, mock_recipe)
    
    assert len(added_items) == 1
    assert added_items[0].quantity == 300.0


def test_process_recipe_ingredients_skips_utensils():
    from app.normalization import process_recipe_ingredients
    mock_session = MagicMock()

    mock_recipe = MagicMock()
    mock_recipe.id = "r123"
    mock_recipe.content_md = "## Ingrédients\n\n- fouet\n- 100 g lait\n\n## Préparation"

    with patch("app.normalization.get_or_create_ingredient_ref", side_effect=[None, MagicMock(id=2)]):
        process_recipe_ingredients(mock_session, mock_recipe)
    
    # Seul le lait doit être ajouté
    assert mock_session.add.call_count == 1


# ── consolidate_shopping_list ───────────────────────────────────────────────

def _make_row(name, slug, cat, qty, unit):
    # Simule une ligne retournée par la requête SQL jointe
    row = MagicMock()
    row.name = name
    row.slug = slug
    row.category = cat
    row.total_qty = qty
    row.common_unit = unit
    return row


def test_consolidate_egg_whole_only():
    from app.normalization import consolidate_shopping_list
    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = [
        _make_row("Oeuf", "oeuf", "Crémerie", 4.0, "piece"),
    ]
    result = consolidate_shopping_list(mock_session, ["r1"])
    assert any("Œufs" in item and "4" in item for item in result)


def test_consolidate_farine_merge():
    from app.normalization import consolidate_shopping_list
    mock_session = MagicMock()
    mock_session.exec.return_value.all.return_value = [
        _make_row("Farine", "farine", "Épicerie", 100.0, "g"),
        _make_row("Farine de blé", "farine-de-ble", "Épicerie", 200.0, "g"),
    ]
    result = consolidate_shopping_list(mock_session, ["r1"])
    # Les deux farines fusionnent sous "Farine de blé"
    assert len(result) == 1
    assert "300" in result[0]
    assert "Farine de blé" in result[0]


# ── cas limites parse_quantity_and_unit ───────────────────────────────────────

def test_parse_unit_without_name():
    """Unité reconnue mais aucun nom après (ex: '2 g') → qty=2, unit=None, name='g'."""
    from app.normalization import parse_quantity_and_unit
    qty, unit, name = parse_quantity_and_unit("2 g")
    # L'unité est reconnue mais sans nom → break → retombe sur le reste comme nom
    # rest = "g", pas d'unité reconnue à ce stade → unit=None, name="g"
    assert qty == 2.0
    assert unit is None
    assert name == "g"


# ── cas limites process_recipe_ingredients ────────────────────────────────────

def test_process_recipe_ingredients_skips_empty_raw():
    from app.normalization import process_recipe_ingredients
    mock_session = MagicMock()
    mock_recipe = MagicMock()
    mock_recipe.id = "r1"
    mock_recipe.content_md = "## Ingrédients\n\n- \n\n## Préparation"
    with patch("app.normalization.get_or_create_ingredient_ref") as mock_ref:
        process_recipe_ingredients(mock_session, mock_recipe)
    mock_ref.assert_not_called()
    mock_session.add.assert_not_called()
