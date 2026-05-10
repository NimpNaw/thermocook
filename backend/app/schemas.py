from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field

class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False

class UserResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class NoteRequest(BaseModel):
    note_text: str = Field(..., max_length=10_000)

class ShoppingListAddRequest(BaseModel):
    recipe_id: str = Field(..., max_length=256)

class ShoppingListExcludeRequest(BaseModel):
    recipe_id: str = Field(..., max_length=256)
    ingredient_raw: str = Field(..., max_length=500)

class RecipePreview(BaseModel):
    id: str
    title: str
    slug: str
    folder_name: Optional[str] = None
    image_main: Optional[str] = None
    difficulty: Optional[str] = None
    total_time: Optional[int] = None
    dominant_color: Optional[str] = None
    category: Optional[str] = None

    class Config:
        from_attributes = True

class RecipeRead(RecipePreview):
    content_md: str
    steps_json: list
    nutrition_json: Optional[dict] = None
    ingredients_json: Optional[List[Dict[str, str]]] = None
    is_public: bool
    created_at: datetime
    updated_at: datetime

class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)

class RecipesBulkRequest(BaseModel):
    recipe_ids: List[str] = Field(..., max_length=100)
