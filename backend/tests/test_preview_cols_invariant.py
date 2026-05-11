"""Invariant entre le schéma de réponse `RecipePreview` et la liste de
colonnes SQL `PREVIEW_COLS`.

Sans ce garde-fou, un champ peut être déclaré dans `RecipePreview`
(côté Pydantic) mais oublié dans `PREVIEW_COLS` (côté SQL) — l'API
sérialise alors le champ avec la valeur SQL `None`, même quand la
donnée existe en base. Cas concret : `portions` était dans le modèle
SQLModel et dans le schéma, mais absent de la requête SELECT des
routes de liste → `null` renvoyé sur /recipes, /recipes/random, etc.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_preview_cols_covers_all_recipe_preview_fields():
    """Chaque champ exposé par `RecipePreview` doit être sélectionné par `PREVIEW_COLS`."""
    from app.main import PREVIEW_COLS
    from app.schemas import RecipePreview

    selected_columns = {col.key for col in PREVIEW_COLS}
    schema_fields = set(RecipePreview.model_fields.keys())

    missing = schema_fields - selected_columns
    assert not missing, (
        f"Colonnes déclarées par RecipePreview mais absentes de "
        f"PREVIEW_COLS : {missing}. Sans elles, l'API renvoie `null` "
        f"sur les routes de liste même si la donnée existe en base."
    )
