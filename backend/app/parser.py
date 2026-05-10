import re
from pathlib import Path
from typing import Optional
from app.models import Recipe
from slugify import slugify


def parse_recipe_markdown(file_path: Path) -> Optional[Recipe]:
    """Parse un fichier recette.md et retourne un objet Recipe SQLModel."""
    if not file_path.exists():
        return None

    # Logique d'ID basée sur le chemin.
    # Structure attendue (3 niveaux) : data/recipes/{source}/{folder}/recette.md
    # Structure plate rétrocompat (2 niveaux) : data/recipes/{folder}/recette.md
    parts = file_path.parts
    try:
        recipes_idx = -1
        for i, p in enumerate(parts):
            if p == 'recipes':
                recipes_idx = i
                break

        if recipes_idx == -1 or len(parts) < recipes_idx + 3:
            return None  # Structure invalide ou fichier hors arborescence recipes

        flat = len(parts) == recipes_idx + 3  # recette.md est au niveau +2
        if flat:
            # Structure plate (ancien format) : data/recipes/slug_rID/recette.md
            recipe_folder = parts[recipes_idx + 1]
            # Inférer la source depuis le nom du dossier
            source_folder = "ckdo_cookidoo" if recipe_folder.startswith("ckdo") else "cmix_cookomix"
        else:
            # Structure normale : data/recipes/{source}/slug_rID/recette.md
            source_folder = parts[recipes_idx + 1]
            recipe_folder = parts[recipes_idx + 2]
    except (ValueError, IndexError):
        return None

    recipe_id = f"{source_folder}_{recipe_folder}"

    content = file_path.read_text(encoding="utf-8")

    # Titre (# Titre)
    title_match = re.search(r"^# (.+)$", content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else "Sans titre"

    # Métadonnées (Difficulté, Temps, Portions)
    # **Difficulté :** Facile | **Temps actif :** 10 min | **Temps total :** 45 min | **Portions :** 4 portions
    meta_line = re.search(r"\*\*Difficulté :\*\* (.+?) \| \*\*Temps actif :\*\* (.+?) \| \*\*Temps total :\*\* (.+?) \| \*\*Portions :\*\* (.+)", content)
    
    def parse_time(time_str: str) -> int:
        """Convertit '45 min', '1h20', '1h 20 min' ou '1 h 20 min' en secondes."""
        time_str = time_str.strip()
        total_sec = 0
        h_match = re.search(r"(\d+)\s*h", time_str)
        m_match = re.search(r"(\d+)\s*min", time_str)
        # Format "4h40" : minutes collées après le h, sans le mot "min"
        hm_match = re.search(r"\d+\s*h(\d+)$", time_str)
        s_match = re.search(r"(\d+)\s*sec", time_str)
        if h_match:
            total_sec += int(h_match.group(1)) * 3600
        if m_match:
            total_sec += int(m_match.group(1)) * 60
        elif hm_match:
            total_sec += int(hm_match.group(1)) * 60
        if s_match:
            total_sec += int(s_match.group(1))
        return total_sec

    difficulty = meta_line.group(1).strip() if meta_line else None
    active_time = parse_time(meta_line.group(2)) if meta_line else 0
    total_time = parse_time(meta_line.group(3)) if meta_line else 0
    portions = meta_line.group(4).strip() if meta_line else None

    # Catégorie de recette (optionnelle)
    cat_match = re.search(r"^\*\*Catégorie :\*\*\s*(.+)$", content, re.MULTILINE)
    category = cat_match.group(1).strip() if cat_match else None

    # Ingrédients (## Ingrédients ... ## Préparation)
    ing_section = re.search(r"## Ingrédients\n\n(.*?)\n\n## Préparation", content, re.DOTALL)
    ingredients = []
    if ing_section:
        for line in ing_section.group(1).strip().split("\n"):
            if line.startswith("- "):
                ingredients.append({"raw": line[2:].strip()})

    # Étapes : à partir de `## Préparation`, jusqu'à la prochaine section
    # connue (`## Informations nutritionnelles`, `## Notes`, ou `## ---`),
    # ou jusqu'à la fin du fichier (`\Z`) si aucune section ne suit.
    # Sans `\Z`, des recettes minimales (sans section terminale) avaient
    # `steps_json: []` à l'import, cassant le mode cuisine.
    steps_section = re.search(
        r"## Préparation\n\n(.*?)(?:\n\n## (?:Informations nutritionnelles|Notes|---)|\Z)",
        content,
        re.DOTALL,
    )
    steps = []
    if steps_section:
        # On cherche les blocs commençant par **1.**, **2.**, etc.
        raw_steps = re.split(r"\n\*\*\d+\.\*\*\s+", "\n" + steps_section.group(1).strip())
        for s in raw_steps:
            text = s.strip()
            if text:
                steps.append({"text": text})

    # Image principale
    img_match = re.search(r"!\[.*?\]\((images/principale\.jpg)\)", content)
    image_main = img_match.group(1) if img_match else None

    # Métadonnées pour l'objet Recipe
    # Structure plate : folder_name = recipe_folder seul (pas de sous-dossier source)
    folder_name = recipe_folder if flat else f"{source_folder}/{recipe_folder}"
    slug = slugify(title)

    return Recipe(
        id=recipe_id,
        title=title,
        slug=slug,
        folder_name=folder_name,
        difficulty=difficulty,
        active_time=active_time,
        total_time=total_time,
        portions=portions,
        content_md=content,
        steps_json=steps,
        image_main=image_main,
        category=category
    )

