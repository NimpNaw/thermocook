import os
import shutil
import sys
from pathlib import Path
from typing import Callable, Optional
from sqlmodel import Session

sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import engine, init_db
from app.models import Recipe, RecipeIngredient, UserFavorite, UserRecipeNote, MealPlan, ShoppingListExclusion
from app.parser import parse_recipe_markdown
from app.normalization import process_recipe_ingredients
from app.thumbs import warmup_thumbnails, THUMBS_DIR
from sqlalchemy import delete, text


def _log(log_fn, msg: str) -> None:
    """Imprime sur stdout ET appelle log_fn si fourni."""
    print(msg)
    if log_fn:
        log_fn(msg)


def _refresh_search_vectors(session: Session) -> None:
    """Met à jour search_vector pour toutes les recettes (batch, appel unique en fin d'import)."""
    session.execute(text("""
        UPDATE recipe
        SET search_vector =
            setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('french', coalesce(slug, '')), 'B') ||
            setweight(to_tsvector('french', coalesce(content_md, '')), 'C')
        WHERE search_vector IS NULL
           OR updated_at > now() - interval '10 minutes'
    """))
    session.commit()


def run_import(
    progress_callback: Optional[Callable[[int, int, str, int], None]] = None,
    log_fn: Optional[Callable[[str], None]] = None,
):
    _log(log_fn, "🚀 Initialisation de la base de données...")
    init_db()

    recipes_dir = Path("data/recipes")
    if not recipes_dir.exists():
        _log(log_fn, f"❌ Dossier {recipes_dir} introuvable.")
        return

    _log(log_fn, f"📂 Analyse récursive du dossier : {recipes_dir}")

    # Récupérer tous les fichiers recette.md
    md_files = list(recipes_dir.rglob("recette.md"))
    total = len(md_files)

    count = 0
    updated = 0
    processed = 0
    errors_list = []
    # Compteurs du lot en attente de commit : basculés vers count/updated
    # uniquement après un commit réussi, pour que le résumé final reflète
    # exactement ce qui est persisté en base.
    pending_new = 0
    pending_updated = 0

    with Session(engine) as session:
        for md_file in md_files:
            recipe_folder = md_file.parent
            processed += 1
            try:
                recipe_data = None
                is_new = False
                # Savepoint par recette : un échec n'annule que la recette en cours,
                # jamais les recettes du lot en attente de commit (commit tous les 50).
                with session.begin_nested():
                    recipe_data = parse_recipe_markdown(md_file)
                    if recipe_data:
                        # folder_name est déjà renseigné avec le chemin relatif par le parser
                        existing = session.get(Recipe, recipe_data.id)
                        if existing:
                            # Vérification de conflit de dossier pour un même ID
                            if existing.folder_name != recipe_data.folder_name:
                                raise ValueError(f"Conflit d'ID {recipe_data.id} : utilisé par {existing.folder_name} et {recipe_data.folder_name}")

                            for key, value in recipe_data.model_dump(exclude={"id", "created_at"}).items():
                                setattr(existing, key, value)
                        else:
                            session.add(recipe_data)
                            is_new = True

                        session.exec(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_data.id))
                        process_recipe_ingredients(session, recipe_data)

                if recipe_data:
                    # Compteurs incrémentés hors savepoint : uniquement si la recette est acquise
                    if is_new:
                        pending_new += 1
                    else:
                        pending_updated += 1

                    if processed % 50 == 0:
                        # Échec du commit géré localement : le lot est perdu, les
                        # compteurs ne doivent pas l'annoncer comme importé et
                        # l'erreur est attribuée au lot, pas à la recette courante.
                        try:
                            session.commit()
                            count += pending_new
                            updated += pending_updated
                        except Exception as commit_err:
                            session.rollback()
                            lost = pending_new + pending_updated
                            error_msg = f"échec du commit du lot : {lost} recette(s) perdue(s) : {commit_err}"
                            _log(log_fn, f"⚠️ {error_msg}")
                            errors_list.append(error_msg)
                        finally:
                            pending_new = pending_updated = 0

                    if progress_callback:
                        progress_callback(processed, total, recipe_folder.name, len(errors_list))
                    # log_fn direct (pas _log) : évite d'inonder stdout avec N lignes de progression
                    if log_fn:
                        log_fn(f"Progression : {processed} / {total} — {recipe_folder.name}")

            except Exception as e:
                # Le savepoint a déjà annulé la recette en échec ; ne PAS rollback la
                # session entière (cela effacerait le lot non committé). Filet de
                # sécurité : une session invalidée impose un rollback pour continuer.
                if not session.is_active:
                    session.rollback()
                    pending_new = pending_updated = 0
                error_msg = f"{recipe_folder.relative_to(recipes_dir)} : {e}"
                _log(log_fn, f"⚠️ {error_msg}")
                errors_list.append(error_msg)
                if progress_callback:
                    progress_callback(processed, total, recipe_folder.name, len(errors_list))

        try:
            session.commit()
            count += pending_new
            updated += pending_updated
        except Exception as commit_err:
            session.rollback()
            lost = pending_new + pending_updated
            error_msg = f"échec du commit du lot final : {lost} recette(s) perdue(s) : {commit_err}"
            _log(log_fn, f"⚠️ {error_msg}")
            errors_list.append(error_msg)

    if progress_callback:
        progress_callback(processed, total, "Terminé", len(errors_list))

    _log(log_fn, "\n✅ Importation terminée !")

    _log(log_fn, "🔍 Mise à jour des vecteurs FTS...")
    try:
        with Session(engine) as session:
            _refresh_search_vectors(session)
        _log(log_fn, "✅ Vecteurs FTS mis à jour.")
    except Exception as e:
        _log(log_fn, f"⚠️  Erreur lors de la mise à jour FTS (non bloquant) : {e}")

    # Résumé final dans run_import
    _log(log_fn, "--- RÉSUMÉ ---")
    _log(log_fn, f"Nouvelles recettes : {count}")
    _log(log_fn, f"Recettes mises à jour : {updated}")
    _log(log_fn, f"Total traité : {processed}")
    if errors_list:
        _log(log_fn, f"Erreurs ({len(errors_list)}) :")
        for err in errors_list[:50]:
            _log(log_fn, f"  - {err}")
    else:
        _log(log_fn, "Aucune erreur.")

    return count, updated, errors_list


def run_sync(
    progress_callback: Optional[Callable[[int, int, str, int], None]] = None,
    log_fn: Optional[Callable[[str], None]] = None,
) -> dict:
    """Synchronisation bidirectionnelle disque ↔ base de données.
    """
    _log(log_fn, "🚀 Synchronisation démarrée")
    init_db()

    recipes_dir = Path("data/recipes")
    if not recipes_dir.exists():
        return {"added": 0, "updated": 0, "deleted": 0, "errors": 0, "error_details": [], "stale_in_db": []}

    md_files = list(recipes_dir.rglob("recette.md"))
    total = len(md_files)

    disk_ids: dict[str, Path] = {}
    # Recettes dont le parsing a échoué mais l'ID a été extrait du nom de dossier
    # → conservées en base avec données périmées, signalées à l'admin
    stale_in_db: list[str] = []
    error_details = []
    added = updated = deleted = errors = 0
    processed = 0
    # Compteurs du lot en attente de commit (cf. run_import) : basculés vers
    # added/updated uniquement après un commit réussi.
    pending_added = 0
    pending_updated = 0

    with Session(engine) as session:
        # Phase 1 : Ajout / mise à jour
        for md_file in md_files:
            processed += 1
            recipe_folder = md_file.parent

            # Extraction de l'ID depuis le chemin disque pour identifier la présence
            # même si le parsing échoue. Format : {source}_{dossier_recette}
            # Pour la structure plate (legacy), le parent est "recipes" → inférer la source.
            folder_id_extracted = None
            try:
                parent_name = recipe_folder.parent.name
                if parent_name == "recipes":
                    inferred_source = "ckdo_cookidoo" if recipe_folder.name.startswith("ckdo") else "cmix_cookomix"
                    folder_id_extracted = f"{inferred_source}_{recipe_folder.name}"
                else:
                    folder_id_extracted = f"{parent_name}_{recipe_folder.name}"
                disk_ids[folder_id_extracted] = recipe_folder
            except Exception:
                pass

            try:
                recipe_data = None
                is_new = False
                # Savepoint par recette : un échec n'annule que la recette en cours,
                # jamais les recettes du lot en attente de commit (commit tous les 50).
                with session.begin_nested():
                    recipe_data = parse_recipe_markdown(md_file)
                    if recipe_data:
                        disk_ids[recipe_data.id] = recipe_folder  # Double vérification de l'ID extrait

                        existing = session.get(Recipe, recipe_data.id)
                        if existing:
                            if existing.folder_name != recipe_data.folder_name:
                                raise ValueError(f"Conflit ID {recipe_data.id} : DB={existing.folder_name}, Disque={recipe_data.folder_name}")

                            for key, value in recipe_data.model_dump(exclude={"id", "created_at"}).items():
                                setattr(existing, key, value)
                        else:
                            session.add(recipe_data)
                            is_new = True

                        session.exec(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_data.id))
                        process_recipe_ingredients(session, recipe_data)

                if not recipe_data:
                    continue

                # Compteurs incrémentés hors savepoint : uniquement si la recette est acquise
                if is_new:
                    pending_added += 1
                else:
                    pending_updated += 1

                if processed % 50 == 0:
                    # Échec du commit géré localement (cf. run_import) : compteurs honnêtes
                    try:
                        session.commit()
                        added += pending_added
                        updated += pending_updated
                    except Exception as commit_err:
                        session.rollback()
                        lost = pending_added + pending_updated
                        err_msg = f"échec du commit du lot : {lost} recette(s) perdue(s) : {commit_err}"
                        _log(log_fn, f"⚠️ {err_msg}")
                        error_details.append(err_msg)
                        errors += 1
                    finally:
                        pending_added = pending_updated = 0

                # Feedback à chaque recette (commit reste tous les 50)
                if progress_callback:
                    progress_callback(processed, total, recipe_folder.name, len(error_details))
                # log_fn direct (pas _log) : évite d'inonder stdout avec N lignes de progression
                if log_fn:
                    log_fn(f"Progression : {processed} / {total} — {recipe_folder.name}")

            except Exception as e:
                # Le savepoint a déjà annulé la recette en échec ; ne PAS rollback la
                # session entière (cela effacerait le lot non committé). Filet de
                # sécurité : une session invalidée impose un rollback pour continuer.
                if not session.is_active:
                    session.rollback()
                    pending_added = pending_updated = 0
                errors += 1
                err_msg = f"{md_file.parent.relative_to(recipes_dir)} : {str(e)}"
                error_details.append(err_msg)
                _log(log_fn, f"⚠️ {err_msg}")
                if folder_id_extracted and session.get(Recipe, folder_id_extracted):
                    stale_in_db.append(str(md_file.parent.relative_to(recipes_dir)))
                if progress_callback:
                    progress_callback(processed, total, recipe_folder.name, len(error_details))

        # Phase 2 : Suppression des orphelines (recettes en base absentes du disque)
        from sqlmodel import select
        db_recipes = session.exec(select(Recipe.id, Recipe.folder_name)).all()
        for db_id, folder_name in db_recipes:
            if db_id not in disk_ids:
                session.exec(delete(ShoppingListExclusion).where(ShoppingListExclusion.recipe_id == db_id))
                session.exec(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == db_id))
                session.exec(delete(UserFavorite).where(UserFavorite.recipe_id == db_id))
                session.exec(delete(UserRecipeNote).where(UserRecipeNote.recipe_id == db_id))
                session.exec(delete(MealPlan).where(MealPlan.recipe_id == db_id))
                recipe = session.get(Recipe, db_id)
                if recipe:
                    session.delete(recipe)
                # Nettoyage des miniatures WebP associées
                if folder_name and THUMBS_DIR.exists():
                    for size_dir in THUMBS_DIR.iterdir():
                        if size_dir.is_dir():
                            thumb_dir = size_dir / folder_name
                            if thumb_dir.exists():
                                shutil.rmtree(thumb_dir, ignore_errors=True)
                deleted += 1

        # Commit final de la phase 1 (reliquat de lot) + phase 2
        session.commit()
        added += pending_added
        updated += pending_updated
        pending_added = pending_updated = 0

        # Phase 3 : Nettoyage des IngredientRef orphelins (sans RecipeIngredient associée)
        session.execute(text("""
            DELETE FROM ingredientref
            WHERE id NOT IN (SELECT DISTINCT ingredient_ref_id FROM recipeingredient)
        """))
        session.commit()

    if progress_callback:
        progress_callback(processed, total, "Nettoyage...", len(error_details))

    _log(log_fn, "🔍 Mise à jour des vecteurs FTS...")
    if progress_callback:
        progress_callback(processed, total, "Mise à jour FTS...", len(error_details))
    try:
        with Session(engine) as session:
            _refresh_search_vectors(session)
        _log(log_fn, "✅ Vecteurs FTS mis à jour.")
    except Exception as e:
        _log(log_fn, f"⚠️  Erreur lors de la mise à jour FTS (non bloquant) : {e}")

    _log(log_fn, "🖼️  Optimisation des images (warmup)...")

    def _on_warmup(done: int, warmup_total: int) -> None:
        progress_callback(processed, total, f"Miniatures : {done} / {warmup_total}", len(error_details))

    try:
        thumb_count = warmup_thumbnails(progress_callback=_on_warmup if progress_callback else None)
        _log(log_fn, f"✨ {thumb_count} miniatures générées avec succès.")
    except Exception as e:
        _log(log_fn, f"⚠️  Échec du warmup des images : {e}")

    # Résumé final dans le log
    _log(log_fn, "--- RÉSUMÉ ---")
    _log(log_fn, f"Ajouts      : {added}")
    _log(log_fn, f"Mises à jour: {updated}")
    _log(log_fn, f"Suppressions: {deleted}")
    _log(log_fn, f"Erreurs     : {errors}")
    if error_details:
        _log(log_fn, "Détail des erreurs :")
        for err in error_details:
            _log(log_fn, f"  - {err}")
    else:
        _log(log_fn, "Aucune erreur.")

    return {
        "added": added,
        "updated": updated,
        "deleted": deleted,
        "errors": errors,
        "error_details": error_details,
        "stale_in_db": stale_in_db,
    }


if __name__ == "__main__":
    run_import()
