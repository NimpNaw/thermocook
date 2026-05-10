import re
from typing import Tuple, Optional
from slugify import slugify
from sqlalchemy import func
from sqlmodel import Session, select
from app.models import IngredientRef, RecipeIngredient, Recipe

# Unités et conversions vers unités de base (g, ml, piece, pincee)
UNITS = {
    # Masse
    "g": {"base": "g", "factor": 1},
    "gr": {"base": "g", "factor": 1},
    "kg": {"base": "g", "factor": 1000},
    # Volume
    "ml": {"base": "ml", "factor": 1},
    "cl": {"base": "ml", "factor": 10},
    "dl": {"base": "ml", "factor": 100},
    "l": {"base": "ml", "factor": 1000},
    "litre": {"base": "ml", "factor": 1000},
    "litres": {"base": "ml", "factor": 1000},
    # Cuillères (normalisées en ml)
    "c. à soupe": {"base": "ml", "factor": 15},
    "c.à soupe": {"base": "ml", "factor": 15},
    "cuillère à soupe": {"base": "ml", "factor": 15},
    "cuillères à soupe": {"base": "ml", "factor": 15},
    "cs": {"base": "ml", "factor": 15},
    "c. à café": {"base": "ml", "factor": 5},
    "c.à café": {"base": "ml", "factor": 5},
    "cuillère à café": {"base": "ml", "factor": 5},
    "cuillères à café": {"base": "ml", "factor": 5},
    "cc": {"base": "ml", "factor": 5},
    # Pièces
    "pincée": {"base": "pincee", "factor": 1},
    "pincées": {"base": "pincee", "factor": 1},
    "gousse": {"base": "piece", "factor": 1},
    "gousses": {"base": "piece", "factor": 1},
    "sachet": {"base": "piece", "factor": 1},
    "sachets": {"base": "piece", "factor": 1},
    "tranche": {"base": "piece", "factor": 1},
    "tranches": {"base": "piece", "factor": 1},
    "feuille": {"base": "piece", "factor": 1},
    "feuilles": {"base": "piece", "factor": 1},
    "branche": {"base": "piece", "factor": 1},
    "branches": {"base": "piece", "factor": 1},
}

# Liste exhaustive du matériel à exclure
UTENSILS = {
    "four", "réfrigérateur", "papier cuisson", "plaque de cuisson", "film alimentaire",
    "rouleau à pâtisserie", "plaque de four", "poêle", "pinceau de cuisine", "congélateur",
    "grille à pâtisserie", "plaque à pâtisserie", "passoire fine", "casserole", "plat à gratin",
    "torchon", "papier absorbant", "saladier", "mixeur", "fouet", "moule", "balance",
    "spatule", "poche à douille", "verrines", "poêle antiadhésive", "ramequins", "moule à cake",
    "bacs à glaçons", "plat à four", "poche à douille cannelée", "plaques à pâtisserie",
    "boîte hermétique", "passoire", "ciseau", "râpe", "mortier", "pilon", "robot",
    "panier vapeur", "varoma", "gobelet doseur", "fouet", "spatule", "moule à manqué",
    "moule à muffins", "moule à tarte", "emporte-pièce", "pince", "écumoire", "louche",
    "micro-ondes", "torchon propre", "torchon propre et humide"
}

# Verbes et adjectifs de préparation à retirer du nom
PREP_WORDS = {
    "coupé", "émincé", "haché", "froid", "température ambiante", "à ajuster",
    "en fonction des goûts", "selon les goûts", "QS", "environ", "environ.",
    "frais", "fraîche", "frais.", "fraîche.", "sec", "sèche", "liquide", "en poudre"
}

CATEGORIES = {
    # Fruits & Légumes
    "pomme": "Fruits & Légumes",
    "poire": "Fruits & Légumes",
    "banane": "Fruits & Légumes",
    "citron": "Fruits & Légumes",
    "orange": "Fruits & Légumes",
    "fraise": "Fruits & Légumes",
    "framboise": "Fruits & Légumes",
    "myrtille": "Fruits & Légumes",
    "cerise": "Fruits & Légumes",
    "abricot": "Fruits & Légumes",
    "peche": "Fruits & Légumes",
    "mangue": "Fruits & Légumes",
    "ananas": "Fruits & Légumes",
    "kiwi": "Fruits & Légumes",
    "fruit": "Fruits & Légumes",
    "legume": "Fruits & Légumes",
    "carotte": "Fruits & Légumes",
    "oignon": "Fruits & Légumes",
    "echalote": "Fruits & Légumes",
    "ail": "Fruits & Légumes",
    "pomme de terre": "Fruits & Légumes",
    "patate": "Fruits & Légumes",
    "tomate": "Fruits & Légumes",
    "courgette": "Fruits & Légumes",
    "aubergine": "Fruits & Légumes",
    "poivron": "Fruits & Légumes",
    "champignon": "Fruits & Légumes",
    "epinard": "Fruits & Légumes",
    "poireau": "Fruits & Légumes",
    "celeri": "Fruits & Légumes",
    "brocoli": "Fruits & Légumes",
    "chou": "Fruits & Légumes",
    "salade": "Fruits & Légumes",
    "laitue": "Fruits & Légumes",
    "roquette": "Fruits & Légumes",
    "mache": "Fruits & Légumes",
    "endive": "Fruits & Légumes",
    "cresson": "Fruits & Légumes",
    "avocat": "Fruits & Légumes",
    "concombre": "Fruits & Légumes",
    "radis": "Fruits & Légumes",
    "betterave": "Fruits & Légumes",
    "artichaut": "Fruits & Légumes",
    "asperge": "Fruits & Légumes",
    "fenouil": "Fruits & Légumes",
    "panais": "Fruits & Légumes",
    "navet": "Fruits & Légumes",
    "butternut": "Fruits & Légumes",
    "potiron": "Fruits & Légumes",
    "potimarron": "Fruits & Légumes",
    "courge": "Fruits & Légumes",
    "herbe": "Fruits & Légumes",
    "persil": "Fruits & Légumes",
    "basilic": "Fruits & Légumes",
    "coriandre": "Fruits & Légumes",
    "menthe": "Fruits & Légumes",
    "ciboulette": "Fruits & Légumes",
    "estragon": "Fruits & Légumes",
    "aneth": "Fruits & Légumes",
    "laurier": "Fruits & Légumes",
    "thym": "Fruits & Légumes",
    "romarin": "Fruits & Légumes",
    # Crémerie
    "lait": "Crémerie",
    "beurre": "Crémerie",
    "creme": "Crémerie",
    "fromage": "Crémerie",
    "gruyere": "Crémerie",
    "emmental": "Crémerie",
    "parmesan": "Crémerie",
    "mozzarella": "Crémerie",
    "camembert": "Crémerie",
    "brie": "Crémerie",
    "comte": "Crémerie",
    "roquefort": "Crémerie",
    "feta": "Crémerie",
    "raclette": "Crémerie",
    "chevre": "Crémerie",
    "reblochon": "Crémerie",
    "yaourt": "Crémerie",
    "yogourt": "Crémerie",
    "oeuf": "Crémerie",
    "mascarpone": "Crémerie",
    "ricotta": "Crémerie",
    # Épicerie
    "farine": "Épicerie",
    "sucre": "Épicerie",
    "sel": "Épicerie",
    "poivre": "Épicerie",
    "huile": "Épicerie",
    "vinaigre": "Épicerie",
    "riz": "Épicerie",
    "pate": "Épicerie",
    "pain": "Épicerie",
    "chocolat": "Épicerie",
    "cacao": "Épicerie",
    "miel": "Épicerie",
    "confiture": "Épicerie",
    "levure": "Épicerie",
    "bicarbonate": "Épicerie",
    "amidon": "Épicerie",
    "maizena": "Épicerie",
    "fecule": "Épicerie",
    "chapelure": "Épicerie",
    "semoule": "Épicerie",
    "couscous": "Épicerie",
    "polenta": "Épicerie",
    "bouillon": "Épicerie",
    "concentre": "Épicerie",
    "boite": "Épicerie",
    "conserve": "Épicerie",
    "haricot": "Épicerie",
    "lentille": "Épicerie",
    "pois": "Épicerie",
    "noix": "Épicerie",
    "amande": "Épicerie",
    "noisette": "Épicerie",
    "pistache": "Épicerie",
    "raisin": "Épicerie",
    "epice": "Épicerie",
    "cannelle": "Épicerie",
    "vanille": "Épicerie",
    "curry": "Épicerie",
    "paprika": "Épicerie",
    "cumin": "Épicerie",
    "curcuma": "Épicerie",
    "gingembre": "Épicerie",
    "muscade": "Épicerie",
    "safran": "Épicerie",
    "sauce soja": "Épicerie",
    "nuoc": "Épicerie",
    "moutarde": "Épicerie",
    "mayonnaise": "Épicerie",
    "ketchup": "Épicerie",
    "tabasco": "Épicerie",
    "worcestershire": "Épicerie",
    "balsamique": "Épicerie",
    # Boucherie
    "viande": "Boucherie",
    "poulet": "Boucherie",
    "dinde": "Boucherie",
    "canard": "Boucherie",
    "pintade": "Boucherie",
    "caille": "Boucherie",
    "boeuf": "Boucherie",
    "veau": "Boucherie",
    "porc": "Boucherie",
    "agneau": "Boucherie",
    "lapin": "Boucherie",
    "jambon": "Boucherie",
    "lardons": "Boucherie",
    "bacon": "Boucherie",
    "saucisse": "Boucherie",
    "merguez": "Boucherie",
    "chorizo": "Boucherie",
    "andouille": "Boucherie",
    "boudin": "Boucherie",
    "foie gras": "Boucherie",
    "steak": "Boucherie",
    "escalope": "Boucherie",
    "filet": "Boucherie",
    "cote": "Boucherie",
    # Poissonnerie
    "poisson": "Poissonnerie",
    "saumon": "Poissonnerie",
    "cabillaud": "Poissonnerie",
    "thon": "Poissonnerie",
    "sardine": "Poissonnerie",
    "sole": "Poissonnerie",
    "daurade": "Poissonnerie",
    "truite": "Poissonnerie",
    "lieu": "Poissonnerie",
    "maquereau": "Poissonnerie",
    "crevette": "Poissonnerie",
    "gambas": "Poissonnerie",
    "langoustine": "Poissonnerie",
    "homard": "Poissonnerie",
    "moule": "Poissonnerie",
    "palourde": "Poissonnerie",
    "coquille": "Poissonnerie",
    "calamar": "Poissonnerie",
    "poulpe": "Poissonnerie",
    "seiche": "Poissonnerie",
    "anchois": "Poissonnerie",
}


def clean_ingredient_name(name: str) -> str:
    """Nettoie le nom de l'ingrédient pour l'extraction."""
    # Retirer les parenthèses et leur contenu (ex: "(coupé en deux)")
    name = re.sub(r"\(.*?\)", "", name)

    name = name.lower().strip()

    # Retirer les articles au début
    name = re.sub(r"^(d'|de l'|du |de la |des |de |un |une |le |la |l')", "", name)

    # Retirer les mots de préparation
    for pw in PREP_WORDS:
        name = re.sub(r"\b" + re.escape(pw) + r"\b", "", name)

    return name.strip()


def parse_quantity_and_unit(raw_text: str) -> Tuple[float, Optional[str], str]:
    """Extrait quantité, unité et nom."""
    # Nettoyage préliminaire des "QS"
    raw_text = re.sub(r"^QS\s*(?:du |de |des |le |la |l'|d')?", "", raw_text.strip())

    # Essayer les unités multi-mots en premier (ex: "c. à soupe", "cuillère à café")
    sorted_units = sorted(UNITS.keys(), key=len, reverse=True)

    m = re.match(r"^(\d+(?:[.,]\d+)?)\s*(.+)$", raw_text)
    if m:
        qty_str = m.group(1).replace(',', '.')
        qty = float(qty_str)
        rest = m.group(2).strip()

        for unit in sorted_units:
            # L'unité doit être suivie d'un espace, d'un "de/d'" ou de fin de texte
            pattern = r"^" + re.escape(unit) + r"(?:\s+(?:d'|de l'|du |de la |des |de |l'|le |la )?|\s*$)(.*)$"
            unit_match = re.match(pattern, rest, re.IGNORECASE)
            if unit_match:
                name = unit_match.group(1).strip()
                if name:
                    return qty, unit, name
                # Unité sans nom : le "rest" entier est le nom (ex: "2 oeufs")
                break

        # Pas d'unité reconnue : tout est le nom
        # Retirer les prépositions de liaison
        rest = re.sub(r"^(?:d'|de l'|du |de la |des |de |l'|le |la )", "", rest)
        return qty, None, rest

    # Pas de nombre : essayer quand même de reconnaître une unité en préfixe (qty=0)
    # Ex: "g de beurre" → (0.0, "g", "beurre"), "pincée de sel" → (0.0, "pincée", "sel")
    for unit in sorted_units:
        pattern = r"^" + re.escape(unit) + r"(?:\s+(?:d'|de l'|du |de la |des |de |l'|le |la )?|\s*$)(.*)$"
        unit_match = re.match(pattern, raw_text, re.IGNORECASE)
        if unit_match:
            name = unit_match.group(1).strip()
            if name:
                return 0.0, unit, name
            break

    # Retirer les prépositions de liaison résiduelles
    rest = re.sub(r"^(?:d'|de l'|du |de la |des |de |l'|le |la )", "", raw_text)
    return 0.0, None, rest


def _detect_egg_type(name: str) -> Optional[str]:
    """Retourne 'yolk', 'white' ou 'whole' si le nom correspond à un type d'œuf."""
    n = name.lower()
    if "jaune" in n and ("oeuf" in n or "œuf" in n):
        return "yolk"
    if "blanc" in n and ("oeuf" in n or "œuf" in n):
        return "white"
    if "oeuf" in n or "œuf" in n:
        return "whole"
    return None


def get_or_create_ingredient_ref(session: Session, raw_name: str) -> Optional[IngredientRef]:
    """Trouve ou crée une référence d'ingrédient, filtre le matériel."""
    cleaned_name = clean_ingredient_name(raw_name)
    if not cleaned_name:
        return None

    # FILTRE CRITIQUE : Si le nom est un ustensile, on l'ignore
    if cleaned_name in UTENSILS:
        return None

    slug = slugify(cleaned_name)
    if not slug:
        return None

    statement = select(IngredientRef).where(IngredientRef.slug == slug)
    ing_ref = session.exec(statement).first()

    if not ing_ref:
        category = "Divers"
        slug_for_cat = slugify(cleaned_name)
        for key, cat in CATEGORIES.items():
            if key in slug_for_cat:
                category = cat
                break

        ing_ref = IngredientRef(
            name=cleaned_name.capitalize(),
            slug=slug,
            category=category
        )
        session.add(ing_ref)
        session.flush()

    return ing_ref


def process_recipe_ingredients(session: Session, recipe: Recipe) -> None:
    """Crée les liens RecipeIngredient normalisés pour une recette.
    
    Extrait les ingrédients directement du Markdown (plus de ingredients_json).
    Normalise les quantités vers les unités de base (kg→g, cl→ml, etc.).
    """
    # Extraction depuis le Markdown
    # On cherche tout entre ## Ingrédients (ou Ingredients) et le prochain header ## ou la fin du fichier
    # Supporte : ## Ingrédients, ## Ingredients, ## INGRÉDIENTS, etc.
    ing_section = re.search(r"##\s*ingr[ée]dients\s*\n(.*?)(?:\n##|$)", recipe.content_md, re.DOTALL | re.IGNORECASE)
    if not ing_section:
        return

    raw_ingredients = [
        line.strip("- ").strip() 
        for line in ing_section.group(1).split("\n") 
        if line.strip().startswith("- ")
    ]

    # Accumulateur en mémoire : {ingredient_ref_id: RecipeIngredient}
    accumulated: dict[int, RecipeIngredient] = {}

    for raw_text in raw_ingredients:
        if not raw_text:
            continue

        qty, unit, name = parse_quantity_and_unit(raw_text)

        # Conversion vers l'unité de base
        if unit and unit in UNITS:
            unit_info = UNITS[unit]
            qty = qty * unit_info["factor"]
            unit = unit_info["base"]

        ing_ref = get_or_create_ingredient_ref(session, name)
        if ing_ref is None:
            continue

        if ing_ref.id in accumulated:
            accumulated[ing_ref.id].quantity += qty
        else:
            accumulated[ing_ref.id] = RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_ref_id=ing_ref.id,
                quantity=qty,
                unit=unit,
                raw_text=raw_text
            )


    for recipe_ing in accumulated.values():
        session.add(recipe_ing)


def get_sql_grouped_shopping_list(
    session: Session,
    recipe_ids: list[str],
    direct_recipe_ids: set[str] | None = None,
    exclusions: set[tuple[str, str]] | None = None,
) -> dict[str, list[dict]]:
    """Groupe les ingrédients par catégorie en utilisant les tables normalisées SQL.
    Prend en compte les exclusions.
    """
    if not recipe_ids:
        return {}

    if direct_recipe_ids is None:
        direct_recipe_ids = set()

    if exclusions is None:
        exclusions = set()

    # On récupère tous les ingrédients normalisés des recettes concernées
    statement = (
        select(
            RecipeIngredient,
            IngredientRef,
            Recipe.title.label("recipe_title")
        )
        .join(IngredientRef, RecipeIngredient.ingredient_ref_id == IngredientRef.id)
        .join(Recipe, RecipeIngredient.recipe_id == Recipe.id)
        .where(RecipeIngredient.recipe_id.in_(recipe_ids))
    )
    
    results = session.exec(statement).all()
    
    grouped: dict[str, list[dict]] = {}
    
    for recipe_ing, ing_ref, recipe_title in results:
        # Vérifier l'exclusion (sur le texte brut d'origine)
        if (recipe_ing.recipe_id, recipe_ing.raw_text) in exclusions:
            continue
            
        category = ing_ref.category or "Divers"
        if category not in grouped:
            grouped[category] = []
            
        # Formatage de l'affichage
        display = recipe_ing.raw_text
        # Supprimer le préfixe QS pour l'affichage (comme dans l'ancienne version)
        display = re.sub(r'^QS\s*(?:d\'|de l\'|du |de la |des |de |l\'|le |la )?', '', display).strip()
        
        grouped[category].append({
            "text": display,
            "recipe": recipe_title,
            "recipe_id": recipe_ing.recipe_id,
            "is_direct": recipe_ing.recipe_id in direct_recipe_ids,
            "raw": recipe_ing.raw_text
        })
        
    return grouped


def consolidate_shopping_list(session: Session, recipe_ids: list[str]) -> list[str]:
    """Génère une liste de courses consolidée à partir des IDs de recettes."""
    if not recipe_ids:
        return []

    # Les quantités sont déjà en unités de base (g, ml, piece…) grâce à
    # la normalisation effectuée par process_recipe_ingredients.
    # func.max(unit) est donc déterministe pour un ingrédient donné.
    statement = (
        select(
            IngredientRef.name,
            IngredientRef.slug,
            IngredientRef.category,
            func.sum(RecipeIngredient.quantity).label("total_qty"),
            func.max(RecipeIngredient.unit).label("common_unit")
        )
        .join(RecipeIngredient)
        .where(RecipeIngredient.recipe_id.in_(recipe_ids))
        .group_by(IngredientRef.id)
        .order_by(IngredientRef.category, IngredientRef.name)
    )

    results = session.exec(statement).all()

    aggregated = {res.slug: {
        "name": res.name,
        "total_qty": res.total_qty,
        "unit": res.common_unit,
        "category": res.category
    } for res in results}

    # --- RÈGLE SPÉCIFIQUE : ŒUFS ---
    # Détection par le nom normalisé plutôt que par des slugs codés en dur,
    # ce qui couvre automatiquement toutes les variantes orthographiques.
    whole_qty = 0.0
    yolk_qty = 0.0
    white_qty = 0.0
    egg_slugs_to_remove = []

    for slug, item in aggregated.items():
        egg_type = _detect_egg_type(item["name"])
        if egg_type == "yolk":
            yolk_qty += item["total_qty"]
            egg_slugs_to_remove.append(slug)
        elif egg_type == "white":
            white_qty += item["total_qty"]
            egg_slugs_to_remove.append(slug)
        elif egg_type == "whole":
            whole_qty += item["total_qty"]
            egg_slugs_to_remove.append(slug)

    for slug in egg_slugs_to_remove:
        aggregated.pop(slug)

    total_eggs = whole_qty + max(yolk_qty, white_qty)
    if total_eggs > 0:
        aggregated["oeufs-total"] = {
            "name": "Œufs",
            "total_qty": total_eggs,
            "unit": "piece",
            "category": "Crémerie"
        }

    # --- RÈGLE SPÉCIFIQUE : FARINE GÉNÉRIQUE ---
    # Si on a "Farine" et "Farine de blé", fusionner sous "Farine de blé"
    if "farine" in aggregated and "farine-de-ble" in aggregated:
        aggregated["farine-de-ble"]["total_qty"] += aggregated.pop("farine")["total_qty"]

    # --- FORMATAGE FINAL ---
    sorted_items = sorted(aggregated.values(), key=lambda x: (x["category"] or "Divers", x["name"]))

    final_list = []
    for item in sorted_items:
        qty = item["total_qty"]
        unit = item["unit"] or ""
        name = item["name"]

        # Reconversion pour lisibilité (ex: 1200g → 1.2 kg)
        if unit == "g" and qty >= 1000:
            qty = qty / 1000
            unit = "kg"
        elif unit == "ml" and qty >= 1000:
            qty = qty / 1000
            unit = "l"

        qty_str = str(int(qty)) if qty == int(qty) else f"{qty:.2f}".rstrip('0').rstrip('.')

        if qty == 0:
            final_list.append(name)
        else:
            final_list.append(f"{qty_str} {unit} {name}".replace("  ", " ").strip())

    return final_list
