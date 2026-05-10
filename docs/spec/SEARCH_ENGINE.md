# 🔍 Spécifications : Moteur de Recherche Catalogue

Ce document décrit le fonctionnement technique et fonctionnel du moteur de recherche global de ThermoCook.

---

## ⚙️ Mécanisme Technique

La recherche repose sur le **Full Text Search (FTS)** de PostgreSQL, optimisé pour la langue française.

### 1. Vectorisation et Pondération
Chaque recette possède une colonne `search_vector` (type `TSVECTOR`) **précalculée** à l'import et indexée via un index **GIN** (`idx_recipe_search_vector`). Le vecteur est pondéré :
*   **Poids A (Critique)** : Titre de la recette.
*   **Poids B (Élevé)** : Slug (identifiant textuel dans l'URL).
*   **Poids C (Standard)** : Contenu Markdown complet.

Le vecteur est recalculé automatiquement lors de chaque import/sync de recettes via un `UPDATE` batch en fin d'opération.

### 2. Algorithme de Classement (Ranking)
Le score de pertinence d'une recette pour une requête donnée est calculé selon trois critères cumulatifs :
1.  **Score FTS (`ts_rank_cd`)** : Calculé sur `search_vector` via l'index GIN (O(log n)), normalisé par la longueur du document (option 16) pour ne pas pénaliser les titres longs.
2.  **Boost de Titre** : Si le terme de recherche est trouvé tel quel dans le titre (`ILIKE %q%`), un bonus de **+5.0** est ajouté au score.
3.  **Boost de Préfixe** : Un bonus de **+2.0** si le titre commence exactement par le terme.

### 3. Filtrage (WHERE)
La clause `WHERE` utilise un **OR** entre deux voies complémentaires :
- **FTS (`@@`)** : Capture les correspondances via racinisation (ex: "pommes" → "pomme"). Utilise l'index GIN pour une performance O(log n).
- **ILIKE** : Capture les correspondances exactes sur titre, slug et contenu Markdown (couverture des termes non-racinisés par le dictionnaire français).

### 4. Tri et Limites
*   **Seuil minimum** : **3 caractères** (aligné backend et frontend).
*   **Tri Primaire** : Score de pertinence (descendant).
*   **Tri Secondaire** : Ordre alphabétique sur le titre (ascendant) pour départager les scores égaux.
*   **Pagination** : L'affichage utilise un **défilement infini** par lots de **40 recettes**.
*   **Limite API** : L'API supporte jusqu'à **100 résultats** par requête (`le=100`), avec une limite par défaut de **40**.

---

## 🖥️ Affichage des Résultats

### Interface Globale
*   **Déclenchement** : La recherche s'active dès que **3 caractères** sont saisis dans l'en-tête (seuil aligné backend et frontend).
*   **Mode Liste** : Les résultats remplacent temporairement le contenu de la page d'accueil.
*   **Feedback** : Un message **"Désolé, aucune recette ne correspond."** est affiché si aucun résultat n'est retourné.

### Recherche Avancée (Multi-mots)
La recherche utilise `websearch_to_tsquery`, permettant des comportements naturels :
*   `tarte pommes` → Cherche les recettes contenant les deux racines.
*   `"tarte aux pommes"` → Cherche l'expression exacte.
*   `-chocolat` → Exclut les recettes contenant du chocolat.

### Fallback
Le filtre `WHERE` combine FTS et ILIKE en OR : si le FTS ne trouve pas de correspondance (terme trop spécifique), le ILIKE prend le relais automatiquement. Il n'y a pas de fallback séparé.
