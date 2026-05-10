# backend/tests/test_parser.py
"""Tests unitaires pour parser.py — parsing de fichiers markdown recette."""
import os
import sys


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SAMPLE_MD = """\
# Tarte aux pommes

**Difficulté :** Facile | **Temps actif :** 15 min | **Temps total :** 45 min | **Portions :** 6 portions

## Ingrédients

- 3 pommes
- 200 g farine
- 100 g beurre

## Préparation

**1.** Épluchez les pommes et coupez-les en lamelles.
**2.** Mélangez la farine et le beurre.

## Informations nutritionnelles

*Source : [Cookidoo](https://cookidoo.fr/recipes/recipe/fr-FR/r123456)*
"""

SAMPLE_MD_WITH_IMAGE = """\
# Gâteau chocolat

**Difficulté :** Moyen | **Temps actif :** 20 min | **Temps total :** 1h | **Portions :** 8 portions

![principale](images/principale.jpg)

## Ingrédients

- 200 g chocolat noir

## Préparation

**1.** Faites fondre le chocolat.

## Notes

*Source : [Cookidoo](https://cookidoo.fr/recipes/recipe/fr-FR/r789012)*
"""

SAMPLE_MD_NO_META = """\
# Recette simple

## Ingrédients

- sel

## Préparation

**1.** Ajouter du sel.

---
"""


def test_parse_recipe_id_from_path_cookidoo(tmp_path):
    from app.parser import parse_recipe_markdown
    # Structure : recipes/ckdo_cookidoo/ma-recette_r123456/recette.md
    recipes_dir = tmp_path / "recipes"
    source_dir = recipes_dir / "ckdo_cookidoo"
    recipe_dir = source_dir / "tarte-aux-pommes_r123456"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    
    recipe = parse_recipe_markdown(f)
    assert recipe.id == "ckdo_cookidoo_tarte-aux-pommes_r123456"
    assert recipe.folder_name == "ckdo_cookidoo/tarte-aux-pommes_r123456"

def test_parse_recipe_id_from_path_cookomix(tmp_path):
    from app.parser import parse_recipe_markdown
    # Structure : recipes/cmix_cookomix/mon-plat_rABCDEF/recette.md
    recipes_dir = tmp_path / "recipes"
    source_dir = recipes_dir / "cmix_cookomix"
    recipe_dir = source_dir / "mon-plat_rABCDEF"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")

    recipe = parse_recipe_markdown(f)
    assert recipe.id == "cmix_cookomix_mon-plat_rABCDEF"
    assert recipe.folder_name == "cmix_cookomix/mon-plat_rABCDEF"

def test_parse_recipe_title(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.title == "Tarte aux pommes"


def test_parse_recipe_difficulty(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.difficulty == "Facile"


def test_parse_recipe_active_time_seconds(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.active_time == 15 * 60


def test_parse_recipe_total_time_seconds(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.total_time == 45 * 60


def test_parse_recipe_total_time_hours(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD_WITH_IMAGE, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.total_time == 3600


def test_parse_recipe_portions(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.portions == "6 portions"


def test_parse_recipe_ingredients(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert "## Ingrédients" in recipe.content_md
    assert "- 3 pommes" in recipe.content_md
    assert "- 200 g farine" in recipe.content_md


def test_parse_recipe_steps(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert len(recipe.steps_json) == 2
    assert "Épluchez" in recipe.steps_json[0]["text"]


def test_parse_recipe_steps_without_trailing_section(tmp_path):
    """Recette sans section terminale (## Notes / Informations) après ## Préparation.

    Cas réel : les 4 recettes d'exemple versionnées et toute recette manuelle
    minimale. Avant le fix, le parser retournait `steps_json: []` car la regex
    exigeait une section suivante.
    """
    from app.parser import parse_recipe_markdown
    md = """\
# Recette minimale

**Difficulté :** Facile | **Temps actif :** 5 min | **Temps total :** 10 min | **Portions :** 2 portions

## Ingrédients

- 100 g de farine
- 1 œuf

## Préparation

**1.** Mélangez la farine et l'œuf.
**2.** Cuisez 5 minutes à 180°C.
"""
    recipe_dir = tmp_path / "recipes/thermocook/minimal_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(md, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert len(recipe.steps_json) == 2
    assert "Mélangez" in recipe.steps_json[0]["text"]
    assert "Cuisez" in recipe.steps_json[1]["text"]


def test_parse_recipe_image_main(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD_WITH_IMAGE, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.image_main == "images/principale.jpg"


def test_parse_recipe_no_image(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.image_main is None


def test_parse_recipe_missing_file(tmp_path):
    from app.parser import parse_recipe_markdown
    result = parse_recipe_markdown(tmp_path / "inexistant.md")
    assert result is None


def test_parse_recipe_no_meta_defaults(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD_NO_META, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.difficulty is None
    assert recipe.active_time == 0
    assert recipe.total_time == 0


def test_parse_recipe_slug(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/test_r1"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.slug == "tarte-aux-pommes"


def test_parse_recipe_manual_id_when_no_url(tmp_path):
    from app.parser import parse_recipe_markdown
    # Même sans URL, on impose la structure recipes/manual/nom_rID
    recipe_dir = tmp_path / "recipes/manual/ma-recette-maison_r123"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD_NO_META, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.id == "manual_ma-recette-maison_r123"


def test_parse_recipe_total_time_compact_hours(tmp_path):
    """Format '4h40' (heures collées sans 'min') est correctement parsé."""
    from app.parser import parse_recipe_markdown
    content = """\
# Recette compact

**Difficulté :** Facile | **Temps actif :** 10 min | **Temps total :** 4h40 | **Portions :** 4 portions

## Ingrédients

- sel

## Préparation

**1.** Saler.

## Informations nutritionnelles

*Source : [Cookidoo](https://cookidoo.fr/recipes/recipe/fr-FR/r999)*
"""
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/compact_r999"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(content, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    # 4h40 = 4*3600 + 40*60 = 14400 + 2400 = 16800 secondes
    assert recipe.total_time == 16800


# ── category parsing ───────────────────────────────────────────────────────────

SAMPLE_MD_WITH_CATEGORY = """\
# Forêt noire

![Forêt noire](images/principale.jpg)

**Difficulté :** Moyen | **Temps actif :** 30 min | **Temps total :** 2h | **Portions :** 8 portions
**Catégorie :** Dessert

## Ingrédients

- 200 g de farine
- 4 œufs

## Préparation

**1.** Mélanger la farine et les œufs.

---
*Source : [Cookidoo](https://cookidoo.fr/recipes/recipe/fr-FR/r81682)*
"""

SAMPLE_MD_WITHOUT_CATEGORY = """\
# Soupe de légumes

**Difficulté :** Facile | **Temps actif :** 10 min | **Temps total :** 30 min | **Portions :** 4 portions

## Ingrédients

- 2 carottes

## Préparation

**1.** Cuire les légumes.

---
*Source : [Cookidoo](https://cookidoo.fr/recipes/recipe/fr-FR/r99999)*
"""

def test_parser_extracts_category(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/foret-noire_r81682"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD_WITH_CATEGORY, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.category == "Dessert"

def test_parser_category_is_none_when_absent(tmp_path):
    from app.parser import parse_recipe_markdown
    recipe_dir = tmp_path / "recipes/ckdo_cookidoo/soupe_r99999"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"
    f.write_text(SAMPLE_MD_WITHOUT_CATEGORY, encoding="utf-8")
    recipe = parse_recipe_markdown(f)
    assert recipe.category is None

def test_parse_cookomix_stocke_le_contenu_tel_quel(tmp_path):
    """Le parser importe le Markdown tel quel, sans normalisation des tags Cookomix.
    La normalisation est faite en dehors de l'application, avant import."""
    from app.parser import parse_recipe_markdown
    recipes_dir = tmp_path / "recipes"
    recipe_dir = recipes_dir / "cmix_cookomix" / "mon-plat_rABCDEF"
    recipe_dir.mkdir(parents=True)
    f = recipe_dir / "recette.md"

    # Contenu déjà normalisé (tel qu'il doit être dans les fichiers sources)
    COOKOMIX_MD = """# Plat
**Difficulté :** Facile | **Temps actif :** 10 min | **Temps total :** 20 min | **Portions :** 4 portions

## Ingrédients
- 100g farine

## Préparation
**1.** Utiliser le [KNEAD] pendant 2 min.
**2.** Puis tourner en [REVERSE].
**3.** Cuire au Varoma.
**4.** Cuire 20 min /[VAROMA]/ vitesse 2.
"""
    f.write_text(COOKOMIX_MD, encoding="utf-8")

    recipe = parse_recipe_markdown(f)
    # Le contenu est stocké tel quel, sans transformation
    assert recipe.content_md == COOKOMIX_MD
