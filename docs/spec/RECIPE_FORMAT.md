# Format de Données des Recettes — ThermoCook

Ce document définit le format "Source de Vérité" utilisé par ThermoCook pour stocker, parser et afficher les recettes. Ce format est conçu pour être lisible par l'homme (Markdown) et facilement exploitable par les scripts d'importation.

---

## 📂 Arborescence des Dossiers

Chaque recette est stockée dans son propre dossier à l'intérieur de `data/recipes/`.

### Conventions de nommage des dossiers
- **Format Standard** : `<source_folder>/<slug-titre>`
  - Exemple Cookidoo : `ckdo_cookidoo/2-bananes-c-ur-fondant_r608371`
  - Exemple Cookomix : `cmix_cookomix/gratin-dauphinois_rA1B2C3`
- **ID de la recette** : Concaténation `{source_folder}_{dossier_recette}`, ex : `ckdo_cookidoo_2-bananes-c-ur-fondant_r608371`. Aucun préfixe ni suffixe n'est extrait.

### Contenu du dossier
```text
<nom-du-dossier>/
├── recette.md          # Contenu complet de la recette (Texte, Ingrédients, Étapes)
└── images/
    └── principale.jpg  # Image principale affichée dans les listes et en détail
```

---

## 📝 Structure du fichier `recette.md`

Le fichier Markdown doit suivre une structure stricte pour être correctement interprété par `app/parser.py`.

### 1. Titre (H1)
La première ligne doit être le titre de la recette.
```markdown
# Titre de la recette
```

### 2. Image principale
Une référence à l'image locale.
```markdown
![Titre de la recette](images/principale.jpg)
```

### 3. Métadonnées
Une ligne unique contenant les informations clés, séparées par des pipes (`|`).
```markdown
**Difficulté :** Facile | **Temps actif :** 10 min | **Temps total :** 45 min | **Portions :** 4 portions
```
*Note : Les durées sont converties en secondes par le parseur.*

### 4. Catégorie (Mandatoire pour filtrage)

Ligne immédiatement après les métadonnées. L'application est strictement agnostique : elle ne procède à aucune catégorisation automatique lors de l'import. Si cette ligne est absente, la recette sera classée dans "Divers".

```markdown
**Catégorie :** Dessert
```

Valeurs canoniques autorisées :

| Valeur | Description |
|---|---|
| `Entrée` | Entrées froides ou chaudes |
| `Plat principal` | Plats complets, viandes, poissons, pâtes… |
| `Dessert` | Gâteaux, tartes, crèmes, glaces… |
| `Apéritif` | Verrines, bouchées, dips… |
| `Boisson` | Jus, smoothies, boissons chaudes… |
| `Accompagnement` | Sauces, purées, gratins, riz… |
| `Soupe` | Veloutés, potages, bouillons |
| `Petit-déjeuner` | Brioches, crêpes, granola, confitures… |
| `Divers` | Par défaut si aucune catégorie claire |

*Si la ligne est absente, `category` vaut `null` en base de données.*

### 5. Section Ingrédients (H2)
Liste à puces simple. Le format idéal est `Quantité Unité Nom`.
- **Note sur l'extraction** : Les scripts comme `cookomix_download.py` convertissent automatiquement les formats sources (ex: `Nom - Quantité Unité`) vers ce standard pour garantir le bon fonctionnement de la liste de courses.
```markdown
## Ingrédients

- 500 g de farine
- 250 ml d'eau
- 1 sachet de levure boulangère
- 1 pincée de sel
```

### 6. Section Préparation (H2)
Liste numérotée avec des étapes en gras pour faciliter le mode cuisine.
```markdown
## Préparation

**1.** Mettre l'eau et la levure dans le bol. {2 min/37°C/vitesse 2}

**2.** Ajouter la farine et le sel. {5 min/pétrin}
```

#### Notation des réglages Thermomix — `{...}`

Tout réglage Thermomix s'écrit entre accolades `{...}`. Les paramètres sont séparés par `/` dans l'ordre : **durée / température / mode / vitesse**. Seuls les paramètres pertinents sont inclus. L'application rend ces blocs en **gras sur fond teal** avec icônes et minuteur cliquable. Aucune transformation n'est appliquée à l'import.

```
{durée/température/vitesse}      → {3 min/Varoma/vitesse 1}
{durée/vitesse}                  → {5 sec/vitesse 5}
{durée/mode}                     → {5 min/pétrin}
{durée/température/mode/vitesse} → {2 min/80°C/inverse/vitesse 2}
{mode/température}               → {Épaissir/90°C}
{durée/mode/N fois}              → {1 sec/turbo/3 fois}
{mode}                           → {Rice cooker}
```

**Durées** — entier ou décimal + unité, composables :

| Format | Exemples |
|---|---|
| Secondes | `30 sec`, `1.0 sec` |
| Minutes | `5 min`, `2 min 30 sec` |
| Heures | `1h30 min` |

**Températures** :

| Valeur | Usage |
|---|---|
| `37°C`, `80°C`, `100°C`… | Température numérique |
| `Varoma` | Température Varoma (≈ 120°C, cuisson vapeur) |

**Modes TM5/TM6** — mots-clés reconnus, chacun associé à une icône :

| Mot-clé | Description | Exemple |
|---|---|---|
| `pétrin` | Pétrissage de pâte | `{5 min/pétrin}` |
| `inverse` | Rotation inverse des lames (plats fragiles) | `{10 min/100°C/inverse/vitesse 1}` |
| `mijotage` | Vitesse douce (remuage délicat) | `{20 min/90°C/mijotage}` |
| `turbo` | Vitesse maximale (mixage puissant) | `{30 sec/turbo}` |
| `Épaissir` | Épaississement de sauces et crèmes | `{Épaissir/90°C}` |
| `Mixage` | Programme mixage automatique | `{Mixage}` |
| `Caramel` | Réalisation de caramel | `{Caramel}` |
| `Bouilloire` | Chauffage rapide de liquide | `{Bouilloire}` |
| `Rice cooker` | Cuisson du riz automatique | `{Rice cooker}` |
| `Cuisson lente` | Mijotage longue durée | `{Cuisson lente}` |
| `Fermentation` | Fermentation (pain, yaourt…) | `{Fermentation}` |
| `Sous-vide` | Cuisson basse température sous-vide | `{Sous-vide/60°C}` |
| `Nettoyage` | Programme nettoyage automatique | `{Nettoyage}` |
| `Éplucher` | Programme épluchage | `{Éplucher}` |
| `Cuisson des œufs` | Programme cuisson des œufs | `{Cuisson des œufs/OFF}` |
| `Râper` | Découpe-Minute — disque râper | `{Râper/Épaisse}` |
| `Émincer` | Découpe-Minute — disque émincer | `{Émincer/Fine}` |
| `Découper en spirale` | Découpe-Spirale | `{Découper en spirale}` |
| `Cuisson sans couvercle` | Cuisson à découvert | `{3 min/100°C/Cuisson sans couvercle}` |

**Vitesses** :

| Format | Exemples |
|---|---|
| Fixe | `vitesse 1` … `vitesse 10` |
| Plage (progression manuelle) | `vitesse 5-10` |

**Hors d'un bloc `{...}`, tous ces mots-clés sont du texte narratif ordinaire** — aucune icône n'est appliquée. Exemple : "Déposer les légumes dans le Varoma." reste du texte brut.

*Exemples complets dans une recette :*
```
**1.** Mettre l'eau et la levure dans le bol. {2 min/37°C/vitesse 2}
**2.** Ajouter la farine et le sel. {5 min/pétrin}
**3.** Faire revenir les oignons. {5 min/Varoma/vitesse 1}
**4.** Mixer jusqu'à consistance lisse. {30 sec/turbo}
**5.** Incorporer la crème. {2 min/80°C/inverse/vitesse 2}
**6.** Épaissir la sauce. {Épaissir/90°C}
**7.** Pulser les herbes. {1 sec/turbo/3 fois}
**8.** Cuire le riz. {Rice cooker}
```

### 7. Informations Nutritionnelles (H2 - Optionnel)
Tableau Markdown standard.
```markdown
## Informations nutritionnelles

*Pour 1 portion*

| Nutriment | Valeur |
|---|---|
| Calories | 250 kcal |
| Lipides | 12 g |
```

### 8. Source (Footer)
Ligne de bas de page indiquant l'origine de la recette.
```markdown
---
*Source : [Cookidoo](https://cookidoo.fr/recipes/recipe/fr-FR/r376542)*
```

---

## 🛠️ Maintenance des Métadonnées

Pour corriger ou enrichir les métadonnées sur un grand nombre de fichiers existants, des scripts sont disponibles dans `scripts/` :

| Script | Rôle |
|---|---|
| `categorize_recipes.py` | Classification automatique par scoring (titre + ingrédients) |
| `enrich_recipes.py` | Traduction des difficultés/portions et extraction des couleurs dominantes |
| `migrate_normalize_settings.py` | Convertit les réglages Thermomix en notation `{...}`. Idempotent. Usage : `python3 migrate_normalize_settings.py --dir data/recipes` |
| `migrate_replace_legacy_tags.py` | Remplace les tags `[TAG]` legacy par leurs mots-clés à l'intérieur des blocs `{}`. Idempotent. Usage : `python3 migrate_replace_legacy_tags.py --dir data/recipes` |
| `test_cookidoo_auth.py` | Vérification de la connexion à l'API Cookidoo |

Une fois les fichiers Markdown modifiés, relancez l'import depuis le backend pour mettre à jour la base de données :
```bash
docker exec thermocook-dev-backend python3 /app/import_recipes.py
```

---

## 🧪 Validation du format

Pour valider qu'une recette est correctement formatée, exécutez le parseur manuellement :
```bash
docker exec thermocook-dev-backend python3 -c "
from app.parser import parse_recipe_markdown
from pathlib import Path
print(parse_recipe_markdown(Path('data/recipes/votre-recette/recette.md')))
"
```
