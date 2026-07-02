import os
import shutil
import threading
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, Query, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session, select, or_, and_, col
from sqlalchemy import case, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql.expression import func as sa_func
from app.database import init_db, get_session
from app.models import Recipe, User, MealPlan, UserFavorite, UserRecipeNote, ImportLog, ShoppingListExclusion, SharedLink, RecipeIngredient, IngredientRef
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user, get_current_admin, ACCESS_TOKEN_EXPIRE_MINUTES
from app.schemas import UserCreate, UserResponse, NoteRequest, ShoppingListAddRequest, ShoppingListExcludeRequest, RecipePreview, RecipeRead, ChangePasswordRequest, RecipesBulkRequest
from app.normalization import get_sql_grouped_shopping_list
from pydantic import BaseModel
from app.import_manager import start_import_job, get_job_status, get_active_job, validate_source
from app.thumbs import router as thumbs_router, RECIPES_DIR
import uvicorn

# Colonnes minimales pour les listes de recettes (optimisation performance)
PREVIEW_COLS = [
    Recipe.id, Recipe.title, Recipe.slug, Recipe.folder_name, Recipe.image_main,
    Recipe.difficulty, Recipe.total_time, Recipe.portions,
    Recipe.dominant_color, Recipe.category
]

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("Base de données initialisée.")
    
    # Vérification de l'intégrité des ingrédients (suite à la migration SQL)
    from app.database import engine
    import import_recipes
    with Session(engine) as session:
        recipe_count = session.exec(select(sa_func.count()).select_from(Recipe)).one()
        ing_count = session.exec(select(sa_func.count()).select_from(RecipeIngredient)).one()
        if recipe_count > 0 and ing_count == 0:
            print("⚠️ Table RecipeIngredient vide alors que des recettes existent.")
            print("🔄 Lancement d'un re-import automatique pour restaurer les ingrédients...")
            threading.Thread(target=import_recipes.run_import, daemon=True).start()
            
    yield

app = FastAPI(
    title="ThermoCook API",
    description="Backend pour la plateforme culinaire ThermoCook",
    version="1.0.0",
    lifespan=lifespan
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Montage du dossier des assets — le dossier est créé s'il n'existe pas
# (instance vierge en production sans recettes importées). Le chemin est résolu
# par rapport au module (cf. app/thumbs.py:RECIPES_DIR) pour rester portable
# entre Docker (/app/data/recipes) et un environnement de tests local.
# `check_dir=False` évite de bloquer le démarrage si le dossier n'existe pas
# encore (cas des tests : pas d'écriture disque, mock du dossier).
try:
    RECIPES_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass
app.mount("/assets", StaticFiles(directory=str(RECIPES_DIR), check_dir=False), name="assets")
app.include_router(thumbs_router)

# Configuration CORS — les origines autorisées sont définies via ALLOWED_ORIGINS
# (liste séparée par des virgules). En l'absence de la variable, on autorise
# uniquement localhost pour le développement local.
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


@app.get("/")
def read_root():
    return {"message": "Bienvenue sur l'API ThermoCook", "status": "online"}

@app.get("/health")
def health_check(session: Session = Depends(get_session)):
    """Vérifie que l'API et la base de données sont opérationnelles."""
    session.exec(select(1))
    return {"status": "ok"}

@app.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
def register(request: Request, user_in: UserCreate, session: Session = Depends(get_session)):
    """Inscrit un nouvel utilisateur avec mot de passe haché."""
    # Vérification si utilisateur existe déjà
    existing_user = session.exec(select(User).where(
        User.username == user_in.username
    )).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà utilisé")
    
    # Création de l'utilisateur avec hachage
    hashed_password = get_password_hash(user_in.password)
    new_user = User(
        username=user_in.username,
        hashed_password=hashed_password
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user

@app.post("/login", response_model=UserResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    """Authentifie un utilisateur et set un cookie HttpOnly."""
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        max_age=int(access_token_expires.total_seconds()),
        secure=COOKIE_SECURE,
    )
    return user

@app.post("/logout")
def logout(response: Response):
    """Efface le cookie d'authentification."""
    response.delete_cookie(key="access_token", httponly=True, samesite="lax", secure=COOKIE_SECURE)
    return {"ok": True}

@app.get("/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    """Retourne les infos de l'utilisateur connecté."""
    return current_user

@app.get("/recipes/random", response_model=List[RecipePreview])
def get_random_recipes(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=12, ge=1, le=200),
    session: Session = Depends(get_session),
):
    """Retourne des recettes aléatoires (version allégée)."""
    statement = select(*PREVIEW_COLS).order_by(sa_func.random()).offset(offset).limit(limit)
    return session.exec(statement).all()



@app.get("/recipes/seasonal", response_model=List[RecipePreview])
def get_seasonal_recipes(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=6, ge=1, le=200),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    session: Session = Depends(get_session),
):
    """Retourne des recettes de saison (version allégée)."""
    from app.seasonal import get_current_seasonal_slugs
    from app.models import IngredientRef

    seasonal_slugs = get_current_seasonal_slugs(month)
    if not seasonal_slugs:
        return get_random_recipes(offset, limit, session)

    seasonal_ids = session.exec(
        select(IngredientRef.id).where(col(IngredientRef.slug).in_(seasonal_slugs))
    ).all()

    if not seasonal_ids:
        return get_random_recipes(offset, limit, session)

    statement = (
        select(*PREVIEW_COLS)
        .where(Recipe.id.in_(
            select(RecipeIngredient.recipe_id)
            .where(col(RecipeIngredient.ingredient_ref_id).in_(seasonal_ids))
            .distinct()
        ))
        .order_by(sa_func.random())
        .offset(offset).limit(limit)
    )
    return session.exec(statement).all()

@app.post("/favorites/sync")
def sync_favorites(recipe_ids: List[str], current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Synchronise les favoris locaux vers le serveur (remplacement complet).

    Supprime tous les favoris existants de l'utilisateur puis insère la liste reçue.
    Garantit que les suppressions côté client sont bien reflétées sur le serveur.
    Retourne aussi les IDs invalides pour que le client puisse alerter l'utilisateur.
    """
    existing = session.exec(
        select(UserFavorite).where(UserFavorite.user_id == current_user.id)
    ).all()
    for fav in existing:
        session.delete(fav)
    # Filtrer les IDs inexistants pour éviter une violation de clé étrangère
    saved: List[str] = []
    invalid_ids: List[str] = []
    if recipe_ids:
        valid_ids = set(session.exec(
            select(Recipe.id).where(Recipe.id.in_(recipe_ids))
        ).all())
        for rid in recipe_ids:
            if rid in valid_ids:
                session.add(UserFavorite(user_id=current_user.id, recipe_id=rid))
                saved.append(rid)
            else:
                invalid_ids.append(rid)
    session.commit()
    return {"status": "success", "saved_ids": saved, "invalid_ids": invalid_ids}


@app.get("/recipes/favorites", response_model=List[RecipePreview])
def get_favorites(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Retourne la liste des favoris de l'utilisateur (version allégée)."""
    statement = (
        select(*PREVIEW_COLS)
        .join(UserFavorite, Recipe.id == UserFavorite.recipe_id)
        .where(UserFavorite.user_id == current_user.id)
        .order_by(Recipe.title.asc())
    )
    return session.exec(statement).all()


@app.get("/recipes/{recipe_id}/notes")
def get_note(recipe_id: str, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Récupère la note personnelle de l'utilisateur sur une recette.
    Retourne toujours {"note": <str>} — chaîne vide si aucune note n'existe."""
    note = session.exec(select(UserRecipeNote).where(
        UserRecipeNote.user_id == current_user.id,
        UserRecipeNote.recipe_id == recipe_id
    )).first()
    return {"note": note.note if note else ""}

@app.post("/recipes/{recipe_id}/notes")
def add_note(recipe_id: str, body: NoteRequest, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Ajoute ou modifie une note personnelle sur une recette."""
    existing = session.exec(select(UserRecipeNote).where(
        UserRecipeNote.user_id == current_user.id,
        UserRecipeNote.recipe_id == recipe_id
    )).first()

    if existing:
        existing.note = body.note_text
        existing.updated_at = datetime.now(timezone.utc)
    else:
        session.add(UserRecipeNote(user_id=current_user.id, recipe_id=recipe_id, note=body.note_text))

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        # Race condition : une note a déjà été créée entre le SELECT et l'INSERT
        # Faire un UPDATE à la place
        existing = session.exec(select(UserRecipeNote).where(
            UserRecipeNote.user_id == current_user.id,
            UserRecipeNote.recipe_id == recipe_id
        )).first()
        if existing:
            existing.note = body.note_text
            existing.updated_at = datetime.now(timezone.utc)
            session.commit()
    return {"status": "success"}

@app.post("/shopping-list/add")
def add_to_shopping_list(body: ShoppingListAddRequest, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Ajoute une recette à la liste de courses et restaure ses ingrédients exclus."""
    recipe = session.get(Recipe, body.recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recette introuvable")

    # Vérifier si déjà présent
    existing = session.exec(
        select(MealPlan).where(
            MealPlan.user_id == current_user.id,
            MealPlan.recipe_id == body.recipe_id,
            MealPlan.meal_type == "shopping_list"
        )
    ).first()

    if not existing:
        new_entry = MealPlan(
            user_id=current_user.id, 
            recipe_id=body.recipe_id, 
            planned_date=datetime(2099, 12, 31, tzinfo=timezone.utc), 
            meal_type="shopping_list"
        )
        session.add(new_entry)
    
    # Supprimer les exclusions pour cette recette (restaurer tous les ingrédients)
    session.exec(
        delete(ShoppingListExclusion).where(
            ShoppingListExclusion.user_id == current_user.id,
            ShoppingListExclusion.recipe_id == body.recipe_id
        )
    )
    
    session.commit()
    return {"status": "success"}

@app.post("/shopping-list/exclude")
def exclude_ingredient(body: ShoppingListExcludeRequest, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Exclut un ingrédient spécifique de la liste de courses."""
    recipe = session.get(Recipe, body.recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recette introuvable")

    clean_raw = body.ingredient_raw.strip()
    # Vérifier si déjà exclu
    existing = session.exec(
        select(ShoppingListExclusion).where(
            ShoppingListExclusion.user_id == current_user.id,
            ShoppingListExclusion.recipe_id == body.recipe_id,
            ShoppingListExclusion.ingredient_raw == clean_raw
        )
    ).first()

    if not existing:
        new_exclusion = ShoppingListExclusion(
            user_id=current_user.id,
            recipe_id=body.recipe_id,
            ingredient_raw=clean_raw
        )
        session.add(new_exclusion)
        session.commit()
    
    return {"status": "success"}


@app.get("/shopping-list")
def get_shopping_list(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Retourne la liste de courses (recettes ajoutées directement)."""
    # Entrées ajout direct (hors planning)
    direct_plans = session.exec(
        select(MealPlan).where(
            MealPlan.user_id == current_user.id,
            MealPlan.meal_type == "shopping_list",
        )
    ).all()

    recipe_ids = [p.recipe_id for p in direct_plans]
    if not recipe_ids:
        return {"categories": {}, "recipes": []}

    # Récupérer les exclusions
    exclusions = session.exec(
        select(ShoppingListExclusion.recipe_id, ShoppingListExclusion.ingredient_raw).where(
            ShoppingListExclusion.user_id == current_user.id
        )
    ).all()
    # Format: {(recipe_id, ingredient_raw), ...}
    exclusion_set = {(e[0], e[1]) for e in exclusions}

    # Récupérer les titres des recettes pour le bandeau du haut
    recipes_info = session.exec(
        select(Recipe.id, Recipe.title).where(col(Recipe.id).in_(recipe_ids))
    ).all()
    recipes_list = [{"id": r[0], "title": r[1]} for r in recipes_info]

    return {
        "categories": get_sql_grouped_shopping_list(session, recipe_ids, direct_recipe_ids=set(recipe_ids), exclusions=exclusion_set),
        "recipes": recipes_list
    }


@app.post("/shopping-list/share")
def share_shopping_list(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Génère un jeton de partage pour la liste de courses courante."""
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    new_link = SharedLink(
        id=token,
        user_id=current_user.id,
        expires_at=expires_at
    )
    session.add(new_link)
    session.commit()
    
    return {"token": token, "expires_at": expires_at}


@app.get("/shared-list/{token}")
@limiter.limit("5/minute")
def get_shared_list(request: Request, token: str, session: Session = Depends(get_session)):
    """Accès public à une liste de courses partagée via un jeton valide."""
    link = session.get(SharedLink, token)
    if not link:
        raise HTTPException(status_code=404, detail="Lien de partage introuvable")
    
    now = datetime.now(timezone.utc)
    expires_at = link.expires_at.replace(tzinfo=timezone.utc) if link.expires_at.tzinfo is None else link.expires_at
    
    if now > expires_at:
        raise HTTPException(status_code=403, detail="Ce lien de partage a expiré")

    # Récupérer les recettes du propriétaire du lien
    direct_plans = session.exec(
        select(MealPlan).where(
            MealPlan.user_id == link.user_id,
            MealPlan.meal_type == "shopping_list",
        )
    ).all()

    # Infos du propriétaire
    owner = session.get(User, link.user_id)
    owner_name = owner.username if owner else "Anonyme"

    recipe_ids = [p.recipe_id for p in direct_plans]
    if not recipe_ids:
        return {
            "categories": {}, 
            "recipes": [], 
            "owner": owner_name, 
            "expires_at": expires_at
        }

    # Récupérer les exclusions du propriétaire
    exclusions = session.exec(
        select(ShoppingListExclusion.recipe_id, ShoppingListExclusion.ingredient_raw).where(
            ShoppingListExclusion.user_id == link.user_id
        )
    ).all()
    exclusion_set = {(e[0], e[1]) for e in exclusions}

    # Récupérer les titres des recettes
    recipes_info = session.exec(
        select(Recipe.id, Recipe.title).where(col(Recipe.id).in_(recipe_ids))
    ).all()
    recipes_list = [{"id": r[0], "title": r[1]} for r in recipes_info]

    return {
        "categories": get_sql_grouped_shopping_list(session, recipe_ids, direct_recipe_ids=set(recipe_ids), exclusions=exclusion_set),
        "recipes": recipes_list,
        "owner": owner_name,
        "expires_at": expires_at
    }


@app.delete("/shopping-list/share/{token}")
def revoke_share_link(token: str, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Révoque un lien de partage spécifique."""
    link = session.get(SharedLink, token)
    if not link or link.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Lien introuvable")
    
    session.delete(link)
    session.commit()
    return {"status": "success"}


@app.delete("/shopping-list/recipe/{recipe_id}", status_code=204)
def remove_recipe_from_shopping_list(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Supprime toutes les entrées 'shopping_list' d'une recette donnée."""
    plans = session.exec(
        select(MealPlan).where(
            MealPlan.user_id == current_user.id,
            MealPlan.recipe_id == recipe_id,
            MealPlan.meal_type == "shopping_list",
        )
    ).all()
    for plan in plans:
        session.delete(plan)
    
    # Supprimer aussi les exclusions associées
    session.exec(
        delete(ShoppingListExclusion).where(
            ShoppingListExclusion.user_id == current_user.id,
            ShoppingListExclusion.recipe_id == recipe_id
        )
    )
    
    session.commit()


@app.post("/recipes/bulk", response_model=List[Recipe])
def get_recipes_bulk(body: RecipesBulkRequest, session: Session = Depends(get_session)):
    """Récupère plusieurs recettes en une seule requête via une liste d'IDs (max 100)."""
    if not body.recipe_ids:
        return []
    statement = select(Recipe).where(col(Recipe.id).in_(body.recipe_ids))
    return session.exec(statement).all()

@app.get("/recipes", response_model=List[RecipePreview])
def list_recipes(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    difficulty: Optional[str] = None,
    max_time: Optional[int] = Query(default=None, ge=0),
    category: Optional[str] = None,
    sort: Optional[str] = None,
    session: Session = Depends(get_session)
):
    """Liste les recettes avec pagination, filtres et tri (version allégée)."""
    statement = select(*PREVIEW_COLS)
    if difficulty:
        statement = statement.where(Recipe.difficulty == difficulty)
    if max_time:
        statement = statement.where(Recipe.total_time <= max_time)
    if category:
        statement = statement.where(Recipe.category == category)

    if sort == "name_asc":
        statement = statement.order_by(Recipe.title.asc())
    elif sort == "name_desc":
        statement = statement.order_by(Recipe.title.desc())
    else:
        statement = statement.order_by(sa_func.random())

    return session.exec(statement.offset(offset).limit(limit)).all()

@app.get("/recipes/search", response_model=List[RecipePreview])
def search_recipes(
    q: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=40, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """Recherche hybride : FTS via index GIN (précalculé) + ILIKE pour couverture maximale."""
    if not q or len(q) < 3:
        return []

    pattern = f"%{q}%"

    # 1. Score FTS — utilise la colonne précalculée pour O(log n) via l'index GIN
    ts_query = sa_func.websearch_to_tsquery("french", q)
    search_vec_col = col(Recipe.search_vector)
    rank_fts = sa_func.ts_rank_cd(search_vec_col, ts_query, 16)

    # 2. Boosts ILIKE sur le titre
    title_match = col(Recipe.title).ilike(pattern)
    title_prefix = col(Recipe.title).ilike(f"{q}%")
    boost = case((title_match, 5.0), else_=0.0)
    prefix_boost = case((title_prefix, 2.0), else_=0.0)

    combined_score = rank_fts + boost + prefix_boost

    # 3. Filtre : FTS (racinisation) OU ILIKE — deux voies complémentaires
    fts_match = search_vec_col.op("@@")(ts_query)

    # ILIKE : pour les requêtes multi-mots, chercher chaque mot individuellement
    # (évite le piège de `%lentille saucisse%` qui exige l'expression exacte)
    words = q.split()
    if len(words) > 1:
        per_word_filter = and_(*[
            or_(
                col(Recipe.title).ilike(f"%{word}%"),
                col(Recipe.content_md).ilike(f"%{word}%")
            )
            for word in words
        ])
        ilike_filter = or_(title_match, per_word_filter)
    else:
        slug_match = col(Recipe.slug).ilike(pattern)
        content_match = col(Recipe.content_md).ilike(pattern)
        ilike_filter = or_(title_match, slug_match, content_match)

    statement = (
        select(*PREVIEW_COLS)
        .where(or_(fts_match, ilike_filter))
        .order_by(combined_score.desc(), Recipe.title.asc())
        .offset(offset).limit(limit)
    )

    return session.exec(statement).all()

@app.get("/recipes/{recipe_id}", response_model=RecipeRead)
def get_recipe(recipe_id: str, session: Session = Depends(get_session)):
    """Récupère une recette par son ID (avec ingrédients normalisés)."""
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recette introuvable")

    # Reconstruire la structure attendue par le frontend pour les ingrédients
    # à partir de la table RecipeIngredient (chargement explicite pour robustesse)
    ingredients = session.exec(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)
    ).all()
    
    recipe_dict = recipe.model_dump()
    recipe_dict["ingredients_json"] = [{"raw": ing.raw_text} for ing in ingredients]

    return recipe_dict


# ---------------------------------------------------------------------------
# Routes Admin (réservées aux utilisateurs avec is_admin=True)
# ---------------------------------------------------------------------------

@app.get("/admin/stats")
def get_admin_stats(
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Retourne les statistiques globales du site."""

    nb_recipes = session.exec(select(sa_func.count()).select_from(Recipe)).one()
    nb_users = session.exec(select(sa_func.count()).select_from(User)).one()
    nb_favorites = session.exec(select(sa_func.count()).select_from(UserFavorite)).one()
    nb_notes = session.exec(select(sa_func.count()).select_from(UserRecipeNote)).one()

    return {
        "recipes": nb_recipes,
        "users": nb_users,
        "favorites": nb_favorites,
        "notes": nb_notes
    }



@app.post("/admin/users", response_model=UserResponse)
def create_user_admin(
    user_in: UserCreate,
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Crée un nouvel utilisateur (admin uniquement)."""
    if session.exec(select(User).where(User.username == user_in.username)).first():
        raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà utilisé")
    new_user = User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        is_admin=user_in.is_admin,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user


@app.patch("/admin/users/{user_id}/password")
def change_password_admin(
    user_id: int,
    body: ChangePasswordRequest,
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Change le mot de passe d'un utilisateur (admin uniquement)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    user.hashed_password = get_password_hash(body.new_password)
    session.commit()
    return {"status": "success"}


@app.get("/admin/users", response_model=List[UserResponse])
def list_users(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Liste tous les utilisateurs (admin uniquement)."""
    return session.exec(select(User).offset(offset).limit(limit)).all()


@app.delete("/admin/users/{user_id}")
def delete_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Supprime un utilisateur (admin uniquement, ne peut pas se supprimer soi-même).

    Nettoie explicitement les dépendances avant la suppression (les FK n'ont pas
    de `ON DELETE CASCADE` côté schéma, donc une suppression brute déclenche une
    IntegrityError dès qu'un favori, une note, une exclusion, un lien partagé
    ou un MealPlan existe).
    """
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Impossible de supprimer un autre administrateur")

    session.exec(delete(UserFavorite).where(UserFavorite.user_id == user_id))
    session.exec(delete(UserRecipeNote).where(UserRecipeNote.user_id == user_id))
    session.exec(delete(ShoppingListExclusion).where(ShoppingListExclusion.user_id == user_id))
    session.exec(delete(SharedLink).where(SharedLink.user_id == user_id))
    session.exec(delete(MealPlan).where(MealPlan.user_id == user_id))
    for recipe in session.exec(select(Recipe).where(Recipe.owner_id == user_id)).all():
        recipe.owner_id = None

    session.delete(user)
    session.commit()
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Endpoints d'import de packages de recettes
# ---------------------------------------------------------------------------

class ImportPackageRequest(BaseModel):
    source: str   # "url" ou "path"
    value: str    # URL ou chemin local


@app.post("/admin/import-package", status_code=202)
def start_import(
    body: ImportPackageRequest,
    _: User = Depends(get_current_admin),
):
    """Démarre un import de package de recettes en arrière-plan."""
    if body.source not in ("url", "path"):
        raise HTTPException(status_code=400, detail="source doit être 'url' ou 'path'")
    try:
        validate_source(body.source, body.value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    with _sync_lock:
        if _sync_status["running"]:
            raise HTTPException(status_code=409, detail="Une synchronisation est en cours, veuillez attendre sa fin avant de lancer un import")
        try:
            job_id = start_import_job(body.source, body.value)
        except RuntimeError:
            raise HTTPException(status_code=409, detail="Un import est déjà en cours")
    return {"job_id": job_id}


@app.get("/admin/import-status/active")
def import_status_active(
    _: User = Depends(get_current_admin),
):
    """Retourne le job en cours ou le dernier job terminé, pour la reconnexion frontend."""
    result = get_active_job()
    if result is None:
        raise HTTPException(status_code=404, detail="Aucun job")
    job_id, job = result
    return {
        "job_id": job_id,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "errors": job.errors,
    }


@app.get("/admin/import-status/{job_id}")
def import_status(
    job_id: str,
    _: User = Depends(get_current_admin),
):
    """Retourne l'état d'un job d'import."""
    job = get_job_status(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job inconnu")
    return {
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "errors": job.errors
    }


@app.get("/admin/import-status/{job_id}/log")
def import_log(
    job_id: str,
    _: User = Depends(get_current_admin),
):
    """Retourne le log détaillé d'un job d'import sous forme de fichier texte."""
    job = get_job_status(job_id)
    if job is None:
        content = f"Log d'import — job {job_id}\nJob introuvable (log non disponible après redémarrage du serveur)."
    else:
        content = job.collector.as_text() if job.collector.lines else f"Log d'import — job {job_id}\nAucun événement enregistré."
    return Response(
        content="\ufeff" + content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=\"import-{job_id[:8]}.log\""},
    )


# ---------------------------------------------------------------------------
# Endpoints d'administration avancée
# ---------------------------------------------------------------------------

@app.get("/admin/import-errors")
def get_import_errors(
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> List[Dict[str, Any]]:
    """Retourne les erreurs d'import récentes (max 50)."""
    logs = session.exec(
        select(ImportLog).order_by(ImportLog.created_at.desc()).limit(50)
    ).all()
    return [
        {
            "id": log.id,
            "source": log.source,
            "error": log.error,
            "created_at": log.created_at.isoformat(),
            "is_resolved": log.is_resolved,
        }
        for log in logs
    ]


@app.post("/admin/import-errors/{error_id}/resolve")
def resolve_import_error(
    error_id: int,
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Marque une erreur d'import comme résolue."""
    log = session.get(ImportLog, error_id)
    if not log:
        raise HTTPException(status_code=404, detail="Erreur introuvable")
    log.is_resolved = True
    session.commit()
    return {"status": "success"}


@app.get("/admin/alerts")
def get_admin_alerts(
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Retourne le nombre d'erreurs d'import non résolues."""
    count = session.exec(
        select(sa_func.count()).select_from(ImportLog).where(ImportLog.is_resolved == False)  # noqa: E712
    ).one()

    return {"unresolved_errors": count}


_sync_status: Dict[str, Any] = {
    "running": False,
    "result": None,
    "processed": 0,
    "total": 0,
    "current_recipe": "",
    "errors": 0,
    "collector": None,   # LogCollector ajouté ici
}
_sync_lock = threading.Lock()


@app.post("/admin/sync-catalog", status_code=202)
def sync_catalog(_: User = Depends(get_current_admin)) -> Dict[str, Any]:
    """Lance une synchronisation complète disque → base de données en arrière-plan."""
    from app.import_manager import _jobs as _import_jobs, LogCollector
    with _sync_lock:
        if _sync_status["running"]:
            raise HTTPException(status_code=409, detail="Une synchronisation est déjà en cours")
        if any(j.status not in ("done", "error") for j in _import_jobs.values()):
            raise HTTPException(status_code=409, detail="Un import de package est en cours, veuillez attendre sa fin avant de lancer une synchronisation")
        _sync_status["running"] = True
        _sync_status["result"] = None
        _sync_status["processed"] = 0
        _sync_status["total"] = 0
        _sync_status["current_recipe"] = ""
        _sync_status["errors"] = 0
        _sync_status["collector"] = LogCollector()

    def _run():
        collector = _sync_status["collector"]
        collector.log("Synchronisation démarrée")

        def _progress(processed: int, total: int, current: str, errors: int) -> None:
            _sync_status["processed"] = processed
            _sync_status["total"] = total
            _sync_status["current_recipe"] = current
            _sync_status["errors"] = errors

        try:
            import import_recipes
            result = import_recipes.run_sync(
                progress_callback=_progress,
                log_fn=collector.log,
            )
            _sync_status["result"] = {"status": "done", **result}
        except Exception as e:
            _sync_status["result"] = {"status": "error", "message": str(e)}
            collector.log(f"❌ Erreur fatale : {e}")
        finally:
            _sync_status["running"] = False

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started"}


@app.get("/admin/sync-catalog/status")
def sync_catalog_status(_: User = Depends(get_current_admin)) -> Dict[str, Any]:
    """Retourne l'état de la dernière synchronisation."""
    return {
        "running": _sync_status["running"],
        "result": _sync_status["result"],
        "processed": _sync_status["processed"],
        "total": _sync_status["total"],
        "current_recipe": _sync_status["current_recipe"],
        "errors": _sync_status["errors"],
    }


@app.get("/admin/sync-catalog/log")
def sync_log(_: User = Depends(get_current_admin)):
    """Retourne le log détaillé de la dernière synchronisation."""
    collector = _sync_status.get("collector")
    content = (
        collector.as_text()
        if (collector and collector.lines)
        else "Aucune synchronisation effectuée dans cette session (ou log non disponible après redémarrage du serveur)."
    )
    return Response(
        content="\ufeff" + content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=\"sync.log\""},
    )


@app.post("/admin/cleanup-images")
def cleanup_images(_: User = Depends(get_current_admin)) -> Dict[str, Any]:
    """Supprime les miniatures orphelines (sans recette correspondante sur disque).

    Structure du cache : data/thumbs/<size>/<source>/<folder_name>/...
    """
    from app.thumbs import THUMBS_DIR, RECIPES_DIR
    if not THUMBS_DIR.exists():
        return {"deleted": 0}

    deleted = 0
    # Parcourir récursivement les dossiers de miniatures (profondeur 2 : source/folder)
    for size_dir in THUMBS_DIR.iterdir():
        if not size_dir.is_dir():
            continue
        
        # On cherche les dossiers de recettes (au format source/folder)
        # On utilise rglob pour trouver tous les sous-dossiers qui devraient correspondre à une recette
        for recipe_thumb_dir in size_dir.rglob("*/*"):
            if not recipe_thumb_dir.is_dir():
                continue
            
            rel_path = recipe_thumb_dir.relative_to(size_dir)
            if not (RECIPES_DIR / rel_path).exists():
                shutil.rmtree(recipe_thumb_dir, ignore_errors=True)
                deleted += 1

    return {"deleted": deleted}


@app.post("/admin/clear-recipes")
def clear_recipes(
    _: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Supprime toutes les recettes et leurs données associées (favoris, notes, liste de courses, miniatures)."""
    from app.thumbs import THUMBS_DIR

    count = session.exec(select(sa_func.count()).select_from(Recipe)).one()
    session.exec(delete(ShoppingListExclusion))
    session.exec(delete(UserFavorite))
    session.exec(delete(UserRecipeNote))
    session.exec(delete(MealPlan))
    # RecipeIngredient référence recipe.id sans ON DELETE CASCADE : purge obligatoire
    # avant Recipe, sinon IntegrityError (même ordre que purge_db).
    session.exec(delete(RecipeIngredient))
    session.exec(delete(Recipe))
    session.exec(delete(IngredientRef))
    session.commit()

    if THUMBS_DIR.exists():
        shutil.rmtree(THUMBS_DIR)
        THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    return {"deleted": count}


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
