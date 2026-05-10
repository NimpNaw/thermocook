from datetime import datetime, timezone
from typing import Optional, List, Dict
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy import Column, UniqueConstraint

class ImportLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source: str  # URL ou chemin de l'archive
    error: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_resolved: bool = Field(default=False)


class MealPlan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    recipe_id: str = Field(foreign_key="recipe.id")
    planned_date: datetime
    meal_type: str = Field(default="dinner") # breakfast, lunch, dinner, snack
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ShoppingListExclusion(SQLModel, table=True):
    """Stocke les ingrédients exclus manuellement par l'utilisateur d'une recette dans sa liste de courses."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    recipe_id: str = Field(foreign_key="recipe.id", index=True)
    ingredient_raw: str = Field(index=True) # Texte brut de l'ingrédient à exclure

class SharedLink(SQLModel, table=True):
    """Lien de partage temporaire pour une liste de courses."""
    id: str = Field(primary_key=True) # UUID
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime

class UserRecipeNote(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "recipe_id", name="uq_userrecipenote_user_recipe"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    recipe_id: str = Field(foreign_key="recipe.id", index=True)
    note: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserFavorite(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    recipe_id: str = Field(foreign_key="recipe.id", primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = Field(default=True)
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relations
    recipes: List["Recipe"] = Relationship(back_populates="owner")
    favorites: List["Recipe"] = Relationship(back_populates="favorited_by", link_model=UserFavorite)
    notes: List["UserRecipeNote"] = Relationship()

class RecipeIngredient(SQLModel, table=True):
    recipe_id: str = Field(foreign_key="recipe.id", primary_key=True)
    ingredient_ref_id: int = Field(foreign_key="ingredientref.id", primary_key=True)
    quantity: float = Field(default=0.0)
    unit: Optional[str] = None
    raw_text: str # Texte d'origine pour référence

class IngredientRef(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    slug: str = Field(unique=True, index=True)
    category: Optional[str] = None # Épicerie, Crémerie, Fruits & Légumes, etc.
    density: Optional[float] = None # g/ml (pour conversions g <-> ml)
    default_unit: str = "g"
    parent_id: Optional[int] = Field(default=None, foreign_key="ingredientref.id")

    # Relations
    recipes: List["Recipe"] = Relationship(back_populates="ingredients_ref", link_model=RecipeIngredient)


class Recipe(SQLModel, table=True):
    id: str = Field(primary_key=True) # Format : {source}_{dossier_recette}
    title: str = Field(index=True)
    slug: str = Field(index=True)
    folder_name: str = Field(default="", index=True) # Nom exact du dossier sur le disque
    difficulty: Optional[str] = None
    active_time: Optional[int] = None # en secondes
    total_time: Optional[int] = None # en secondes
    portions: Optional[str] = None

    # Contenu riche
    content_md: str # Source de vérité pour l édition
    steps_json: List[Dict] = Field(default=[], sa_column=Column(JSONB))
    nutrition_json: Optional[Dict] = Field(default=None, sa_column=Column(JSONB))

    # Métadonnées plateforme
    is_public: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")
    owner: Optional[User] = Relationship(back_populates="recipes")
    favorited_by: List[User] = Relationship(back_populates="favorites", link_model=UserFavorite)

    # Relations ingrédients normalisés (Source de vérité unique désormais)
    ingredients: List[RecipeIngredient] = Relationship(sa_relationship_kwargs={"cascade": "all, delete-orphan", "overlaps": "ingredients_ref,recipes"})
    ingredients_ref: List[IngredientRef] = Relationship(back_populates="recipes", link_model=RecipeIngredient, sa_relationship_kwargs={"overlaps": "ingredients,recipes"})

    # Liens assets
    image_main: Optional[str] = None # Chemin relatif ou URL
    dominant_color: Optional[str] = None  # Couleur dominante hex ex: "#f4a261"
    category: Optional[str] = None  # Entrée, Plat principal, Dessert, Apéritif, Boisson, Accompagnement, Soupe, Petit-déjeuner, Divers

    # Vecteur FTS précalculé — peuplé à l'import, indexé via GIN (idx_recipe_search_vector)
    search_vector: Optional[str] = Field(
        default=None,
        sa_column=Column(TSVECTOR, nullable=True)
    )
