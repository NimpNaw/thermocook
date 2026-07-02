"""Reproduit la perte silencieuse de recettes lors d'un rollback en cours de lot.

Bug : run_import/run_sync ne committent que toutes les 50 recettes ; en cas
d'exception sur une recette, `session.rollback()` annulait TOUT le lot en
cours — jusqu'à 49 recettes déjà comptées comme importées avec succès
n'étaient jamais persistées, et le résumé final mentait sur les compteurs.

Le correctif isole chaque recette dans un savepoint (`begin_nested`) : l'échec
d'une recette n'affecte plus le reste du lot.
"""
import os
import sys

import pytest
from sqlalchemy.exc import OperationalError
from sqlmodel import Session, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import IngredientRef, Recipe, RecipeIngredient  # noqa: E402


def _setup_fake_recipes_dir(tmp_path, folders):
    recipes_dir = tmp_path / "data" / "recipes"
    for folder in folders:
        d = recipes_dir / "cmix_cookomix" / folder
        d.mkdir(parents=True)
        (d / "recette.md").write_text(f"# {folder}", encoding="utf-8")
    return recipes_dir


def _fake_parse_fail_on_second_call():
    """Parseur factice : échoue au 2e appel, quel que soit l'ordre de parcours rglob."""
    calls = {"n": 0}

    def fake_parse(md_file):
        calls["n"] += 1
        if calls["n"] == 2:
            raise ValueError("recette corrompue (simulation)")
        folder = md_file.parent.name
        return Recipe(
            id=f"cmix_cookomix_{folder}",
            title=folder,
            slug=folder,
            folder_name=f"cmix_cookomix/{folder}",
            content_md=f"# {folder}",
        )

    return fake_parse


@pytest.fixture()
def patched_import(fk_engine, tmp_path, monkeypatch):
    """Prépare import_recipes sur moteur SQLite + parseur factice + cwd temporaire."""
    import import_recipes as ir

    monkeypatch.setattr(ir, "engine", fk_engine)
    monkeypatch.setattr(ir, "init_db", lambda: None)
    monkeypatch.setattr(ir, "process_recipe_ingredients", lambda session, recipe: None)
    monkeypatch.setattr(ir, "_refresh_search_vectors", lambda session: None)
    monkeypatch.setattr(ir, "warmup_thumbnails", lambda progress_callback=None: 0)
    monkeypatch.setattr(ir, "parse_recipe_markdown", _fake_parse_fail_on_second_call())
    monkeypatch.chdir(tmp_path)
    return ir


def test_run_import_ne_perd_pas_le_lot_sur_erreur(patched_import, fk_engine, tmp_path):
    _setup_fake_recipes_dir(tmp_path, ["recette-a", "recette-b", "recette-c"])

    count, updated, errors_list = patched_import.run_import()

    assert count == 2
    assert len(errors_list) == 1

    with Session(fk_engine) as session:
        persisted = session.exec(select(Recipe)).all()
    # Les 2 recettes traitées avec succès doivent être en base, pas seulement
    # celles traitées après l'échec.
    assert len(persisted) == 2, (
        f"{len(persisted)} recette(s) persistée(s) alors que le résumé en annonce {count} : "
        "le rollback d'une recette en échec a effacé le reste du lot"
    )


def test_run_sync_ne_perd_pas_le_lot_sur_erreur(patched_import, fk_engine, tmp_path):
    _setup_fake_recipes_dir(tmp_path, ["recette-a", "recette-b", "recette-c"])

    result = patched_import.run_sync()

    assert result["added"] == 2
    assert result["errors"] == 1

    with Session(fk_engine) as session:
        persisted = session.exec(select(Recipe)).all()
    assert len(persisted) == 2, (
        f"{len(persisted)} recette(s) persistée(s) alors que le résumé en annonce "
        f"{result['added']} : le rollback d'une recette en échec a effacé le reste du lot"
    )


def _fake_parse_ok(md_file):
    folder = md_file.parent.name
    return Recipe(
        id=f"cmix_cookomix_{folder}",
        title=folder,
        slug=folder,
        folder_name=f"cmix_cookomix/{folder}",
        content_md=f"# {folder}",
    )


def _fake_process_with_writes(fail_on_recipe_id):
    """Écrit réellement des lignes (IngredientRef + RecipeIngredient) avant d'échouer.

    Exerce le vrai ROLLBACK TO SAVEPOINT : les écritures partielles de la recette
    en échec doivent être annulées sans toucher au reste du lot.
    """

    def fake_process(session, recipe):
        ref = IngredientRef(name=f"ing-{recipe.id}", slug=f"ing-{recipe.id}")
        session.add(ref)
        session.flush()
        session.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_ref_id=ref.id,
                raw_text="ingrédient simulé",
            )
        )
        session.flush()
        if recipe.id == fail_on_recipe_id:
            raise ValueError("échec après écritures partielles (simulation)")

    return fake_process


def test_run_import_annule_les_ecritures_partielles_de_la_recette_en_echec(
    patched_import, fk_engine, tmp_path, monkeypatch
):
    """La recette en échec a déjà écrit en base : seul SON savepoint doit sauter."""
    _setup_fake_recipes_dir(tmp_path, ["recette-a", "recette-b", "recette-c"])
    monkeypatch.setattr(patched_import, "parse_recipe_markdown", _fake_parse_ok)
    monkeypatch.setattr(
        patched_import,
        "process_recipe_ingredients",
        _fake_process_with_writes("cmix_cookomix_recette-b"),
    )

    count, _updated, errors_list = patched_import.run_import()

    assert count == 2
    assert len(errors_list) == 1

    with Session(fk_engine) as session:
        recipe_ids = {r.id for r in session.exec(select(Recipe)).all()}
        ingredient_slugs = {ref.slug for ref in session.exec(select(IngredientRef)).all()}
        links = session.exec(select(RecipeIngredient)).all()

    assert recipe_ids == {"cmix_cookomix_recette-a", "cmix_cookomix_recette-c"}
    # Les écritures partielles de recette-b (ref + liaison) ont été annulées
    assert ingredient_slugs == {
        "ing-cmix_cookomix_recette-a",
        "ing-cmix_cookomix_recette-c",
    }
    assert len(links) == 2


def test_run_import_compteurs_honnetes_si_le_commit_du_lot_echoue(
    patched_import, fk_engine, tmp_path, monkeypatch
):
    """Si le commit périodique (tous les 50) échoue, le lot est perdu : les compteurs
    ne doivent PAS annoncer ces recettes comme importées, et l'échec doit être
    attribué au lot, pas à la recette courante."""
    folders = [f"recette-{i:02d}" for i in range(50)]
    _setup_fake_recipes_dir(tmp_path, folders)
    monkeypatch.setattr(patched_import, "parse_recipe_markdown", _fake_parse_ok)

    orig_commit = Session.commit
    calls = {"n": 0}

    class FailingFirstCommitSession(Session):
        def commit(self):
            calls["n"] += 1
            if calls["n"] == 1:
                # Simule une panne au COMMIT : la transaction est perdue
                self.rollback()
                raise OperationalError("COMMIT", None, Exception("connexion perdue (simulation)"))
            orig_commit(self)

    monkeypatch.setattr(patched_import, "Session", FailingFirstCommitSession)

    count, updated, errors_list = patched_import.run_import()

    with Session(fk_engine) as session:
        persisted = session.exec(select(Recipe)).all()

    assert persisted == [], "le lot dont le commit a échoué ne doit pas être en base"
    assert count == 0, (
        f"le résumé annonce {count} nouvelles recettes alors que rien n'a été persisté"
    )
    assert updated == 0
    assert len(errors_list) == 1
    assert "lot" in errors_list[0]
