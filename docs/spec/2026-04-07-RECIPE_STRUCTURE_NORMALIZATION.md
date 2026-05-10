# Spécification : Normalisation et Validation des Sources de Recettes

## 1. Contexte
Actuellement, les recettes Cookidoo et Cookomix sont mélangées à la racine de `data/recipes/`. Les recettes Cookomix utilisent un préfixe `cmx-` ad-hoc. Cette structure limite l'évolution vers de nouvelles sources et manque de rigueur pour l'identification unique.

## 2. Objectifs
- Isoler physiquement les sources dans des sous-dossiers dédiés.
- Uniformiser le format des dossiers de recettes (slug libre, sans contrainte de suffixe).
- Uniformiser les IDs en base de données (concaténation `{source_folder}_{recipe_folder}`).
- Implémenter une validation stricte lors de l'import avec remontée d'erreurs structurelles.

## 3. Architecture Cible

### 3.1 Structure des Dossiers
Les recettes doivent désormais résider exclusivement dans :
`data/recipes/{source_folder}/{recipe_folder}/recette.md`

| Source | `source_folder` | Format `recipe_folder` |
| :--- | :--- | :--- |
| **Cookidoo** | `ckdo_cookidoo` | `[slug]_r[digits]` |
| **Cookomix** | `cmix_cookomix` | `[slug]_r[hash_6]` |

### 3.2 Identifiants (IDs) en Base de Données
L'ID est calculé dynamiquement par le parser : `{source_folder}_{recipe_folder}`.

Exemples :
- `ckdo_cookidoo_tarte-aux-pommes` → ID `ckdo_cookidoo_tarte-aux-pommes`
- `cmix_cookomix_gratin-dauphinois` → ID `cmix_cookomix_gratin-dauphinois`

Aucun préfixe ni suffixe n'est extrait — le nom de dossier est utilisé tel quel.

## 4. Logique métier

### 4.1 Validation lors de l'import (Backend)
Le script `import_recipes.py` et le `import_manager.py` doivent valider :
1. **Source autorisée** : Le dossier parent doit être un sous-dossier de `data/recipes/`.
2. **Unicité** : Deux dossiers différents ne doivent pas produire le même ID final (garanti par la concaténation du chemin complet).
3. **Parsing** : Le fichier `recette.md` doit être présent et parsable.

En cas d'échec, la recette est ignorée et une erreur détaillée est ajoutée au rapport d'import.

## 5. Plan de Migration
1. **Nettoyage** : Remise à zéro de la base de données (tables de recettes, ingrédients, plannings, favoris).
2. **Migration Physique** : Script `scripts/migrate_recipe_folders.py` pour :
    - Créer les dossiers de source.
    - Déplacer et renommer les dossiers Cookomix (calcul du hash).
    - Déplacer les dossiers Cookidoo.
3. **Mise à jour du Code** :
    - `backend/app/parser.py` : Nouvelle logique d'extraction d'ID basée sur le chemin.
    - `backend/app/models.py` : (Optionnel) Ajout d'un champ `source` pour faciliter les filtres.
    - `backend/import_recipes.py` : Scan récursif et gestion des erreurs de structure.
    - `scripts/` : Mise à jour des scripts de téléchargement pour respecter la nouvelle structure.

## 6. Critères de Succès
- 100% des recettes sont classées par source sur le disque.
- Tous les IDs en base sont de la forme `{source_folder}_{recipe_folder}`.
- Le tableau de bord affiche les erreurs si un dossier "intrus" (sans `recette.md` valide) est ajouté manuellement dans `data/recipes`.
