# 🧠 Mémoire du Projet (Apprentissages)

> **But :** Capitalisation des connaissances et retour d'expérience pour éviter la répétition d'erreurs.
> **Contenu :** Décisions techniques complexes, solutions aux problèmes difficiles, "leçons apprises" et justifications de choix d'architecture sensibles.

Ce document conserve les décisions techniques complexes, les pièges évités et les apprentissages clés réalisés lors du développement de ThermoCook.

---

## 📌 Apprentissages Clés

### 🧩 Normalisation des Ingrédients (Phase 6)
- **Problème** : Les recettes utilisent des unités variées (kg, g, cl, tasses, cuillères). L'agrégation pour la liste de courses était impossible.
- **Solution** : Normalisation systématique vers les unités SI de base (grammes, millilitres) lors de l'importation.
- **À retenir** : Toujours stocker les quantités dans une unité pivot unique pour faciliter les calculs SQL (`SUM`).

### 🔍 Recherche Full-Text (Phase 8)
- **Problème** : La recherche simple `LIKE` était trop lente et peu pertinente.
- **Solution** : Utilisation de `tsvector` et `tsquery` de PostgreSQL avec pondération (`setweight`). Les titres ont le poids 'A', les ingrédients le poids 'B'.
- **À retenir** : PostgreSQL est extrêmement puissant pour la recherche textuelle, inutile d'ajouter Elasticsearch pour ce volume de données.

### 📅 Planning AM/PM (Phase 14)
- **Problème** : Un planning en vrac sans distinction de repas est peu lisible.
- **Solution** : Séparation visuelle en deux slots (Midi/Soir) avec icônes distinctes. Utilisation du `sessionStorage` pour conserver le contexte lors de l'ajout depuis le catalogue.
- **À retenir** : Toujours prévoir un mécanisme de "slot vide" attractif pour inciter à la planification.

### 🗂️ Normalisation des Sources (Phase 15)
- **Problème** : Mélange des sources à la racine de `data/recipes/` et IDs incohérents.
- **Solution** : Isolation physique par source (`ckdo_cookidoo`, `cmix_cookomix`) et IDs construits par concaténation `{source_folder}_{recipe_folder}` (ex : `ckdo_cookidoo_tarte-aux-pommes`).
- **Validation** : Le parser construit l'ID directement depuis le chemin (`source/recipe_folder/recette.md`), sans extraction de suffixe. L'import remonte les erreurs de structure au dashboard.
- **À retenir** : L'ID d'une ressource devrait idéalement être déductible de sa localisation physique pour garantir une synchronisation sans faille.

### 🚀 Pertinence de Recherche & Scroll Infini (Phase 16)
- **Problème** : Les résultats de recherche étaient limités à 20, cachant des recettes pertinentes (ex: "lentilles" en position 67). La pertinence FTS seule ne suffisait pas pour les titres longs.
- **Solution** : 
    1.  **Boost ILIKE** : Ajout d'un bonus massif au score FTS si le terme de recherche match exactement le titre (`ILIKE`).
    2.  **Scroll Infini** : Remplacement du bouton "Voir plus" par un chargement automatique par lots de 40 via l'`IntersectionObserver`.
    3.  **Pagination Backend** : Généralisation de l'usage de `offset` et `limit` sur tous les endpoints de recettes.
- **À retenir** : Pour un catalogue de +13 000 entrées, la pagination fluide est plus critique que la recherche exacte. Le boost par titre compense les faiblesses du stemming FTS sur les mots courts.

### 🧹 Simplification & Gestion Granulaire (Phase 17)
- **Problème** : Les fonctionnalités "Frigo" et "Planning" ajoutaient une complexité technique et une charge mentale utilisateur jugées excessives par rapport à leur usage réel.
- **Solution** : Suppression complète des deux modules pour recentrer l'app sur le Catalogue et une Liste de Courses ultra-performante.
- **Innovation** : Passage à une gestion granulaire des ingrédients. Au lieu de retirer une "recette" des courses, l'utilisateur peut masquer des lignes spécifiques. 
- **Persistance** : Création d'une table d'exclusions (`ShoppingListExclusion`) pour mémoriser ces choix. L'ajout répété d'une recette sert désormais de "reset" pour ses ingrédients.
- **À retenir** : Moins c'est mieux. Une fonctionnalité simple et parfaitement exécutée (Liste de courses avec mode invité) vaut mieux qu'un planning complexe peu utilisé. L'usage du `localStorage` pour les invités garantit une expérience PWA fluide en magasin sans complexifier le backend.

### 🐟 Saisonnalité Marine (Phase 18)
- **Problème** : Les suggestions saisonnières étaient limitées aux fruits et légumes, ignorant une part importante de l'alimentation durable : la pêche.
- **Solution** : Enrichissement de `seasonal.py` avec un calendrier de pêche durable (bar, cabillaud, sardines, moules, etc.).
- **Impact** : Meilleure diversité des suggestions sur l'accueil et promotion d'une consommation marine responsable.
- **À retenir** : La saisonnalité est un concept global qui gagne à être étendu au-delà du végétal pour offrir une expérience culinaire complète.

### 🔍 Correction Moteur de Recherche (Phase 20)
- **Problème** : Le vecteur FTS était recalculé à la volée (O(n) scan) à chaque requête, et la clause WHERE ne filtrait que via ILIKE — le FTS ne servait qu'au tri. Seuil incohérent (2 chars backend, 3 chars frontend). Double appel API pour les suggestions (hors TanStack Query).
- **Solution** :
    1. **Colonne `search_vector` précalculée** avec index GIN (`idx_recipe_search_vector`) — scan O(n) → O(log n).
    2. **WHERE hybride** : `OR (search_vector @@ ts_query, title ILIKE, slug ILIKE, content_md ILIKE)` — FTS et ILIKE sont deux voies complémentaires.
    3. **Seuil unifié à 3 caractères** backend (`len(q) < 3`) et frontend (`query.length >= 3`).
    4. **Overlay de résultats unifié** (`useSearchRecipesInfiniteQuery`, scroll infini) — la recherche ouvre directement l'overlay ; pas de composant d'autocomplétion séparé.
    5. **Fix `Query(le=200)`** — le paramètre `lte` de FastAPI n'existe pas ; `le` est le bon.
- **À retenir** : Un index GIN sur TSVECTOR précalculé est indispensable pour la performance FTS sur +13k recettes. Sans cela, le scoring FTS ne sert qu'au tri sur un scan complet. Toujours vérifier les contraintes FastAPI avec `le`/`ge` et non `lte`/`gte`.

### 🍽️ Schéma Pydantic vs sélection SQL (PREVIEW_COLS) — Phase 23
- **Problème** : Le champ `portions`, présent en base et bien parsé depuis le Markdown, n'apparaissait nulle part dans l'UI. Deux corrections en cascade ont été nécessaires :
    1. Le champ n'était pas déclaré dans le schéma de réponse Pydantic `RecipePreview` → FastAPI filtrait silencieusement la valeur (`response_model` n'expose que les champs déclarés).
    2. Une fois le schéma corrigé, l'API renvoyait `null` sur les routes de liste : la constante `PREVIEW_COLS` (liste de colonnes SELECT optimisée pour les listes) n'incluait pas non plus `Recipe.portions`. Le détail `GET /recipes/{id}` n'était pas concerné car il fait `session.get(Recipe, id)` qui charge toute la ligne.
- **Solution** :
    1. Ajout de `portions: Optional[str] = None` dans `RecipePreview` ([PR #88](https://example.com/fabien/thermocook/pulls/88)).
    2. Ajout de `Recipe.portions` à `PREVIEW_COLS` ([PR #89](https://example.com/fabien/thermocook/pulls/89)).
    3. **Test d'invariant** `backend/tests/test_preview_cols_invariant.py` : vérifie que **chaque** champ déclaré par `RecipePreview` est effectivement sélectionné par `PREVIEW_COLS`. Détecte automatiquement toute future omission du même type.
- **À retenir** : Quand une optimisation perf introduit une **liste de colonnes explicites** parallèle au schéma de réponse, le couplage devient fragile : un champ peut être déclaré côté schéma mais oublié côté SQL (ou inversement), et l'API renvoie alors `null` silencieusement même si la donnée existe en base. **Toujours** garder un test d'invariant qui lie les deux. Les mocks de `session.exec(...).all()` qui renvoient des objets `Recipe` complets ne suffisent pas — ils masquent ce genre d'oubli.

### 🌊 Fluidité du scroll catalogue (mobile Chrome)
- **Problème** : Saccades brèves perçues lors du scroll de `/recipes` sur Android Chrome, surtout au moment où les thumbs entrent en lazy-load. La grille pousse 200+ cartes en DOM, toutes peintes en permanence et re-rendues à chaque fetch.
- **Solution** : Trois leviers natifs minimaux (5 lignes au total) :
    1. `decoding="async"` sur les `<img>` (`RecipeImage.tsx`) — décodage hors main thread.
    2. `[content-visibility:auto] [contain-intrinsic-size:280px]` sur le wrapper de `RecipeCard` — le navigateur skip le paint/layout des cartes hors viewport.
    3. `React.memo(RecipeCard)` — props stables (objet `recipe` par référence depuis le cache TQ, callbacks `useCallback` côté `App.tsx`) ⇒ comparaison shallow suffit.
- **À retenir** : Avant `react-window`/`tanstack-virtual`, **épuiser les leviers natifs** (`content-visibility: auto`, `decoding="async"`, `React.memo` sur props stables). Ils règlent l'essentiel du jank sans dépendance ni complexité. Tailwind 4 accepte les classes arbitraires de CSS containment (`[content-visibility:auto]`) sans config supplémentaire.

### ⚡ Performance, Unification & App Shell (Phase 19)
- **Optimisation Recherche** : Passage d'un scan séquentiel (O(n)) à un scan par index (O(log n)) via l'extension **Trigramme (`pg_trgm`)** de PostgreSQL.
- **Unification SQL** : Suppression de la colonne `ingredients_json` (JSONB) au profit d'une source de vérité unique normalisée dans la table `RecipeIngredient`. Le backend reconstruit dynamiquement le JSON pour le frontend si nécessaire.
- **Data Fetching** : Migration vers **TanStack Query** côté frontend pour centraliser le cache, gérer proprement les états de chargement et supprimer le code "boiler-plate" des `useEffect`.
- **Architecture App Shell** : Résolution définitive des problèmes de barre de navigation mouvante sur mobile en verrouillant le défilement du navigateur (`overflow: hidden`) et en implémentant un scroll interne (`100dvh`).
- **À retenir** : Pour une application mobile-first, le contrôle total du scroll du viewport est indispensable. La normalisation SQL est plus performante que le JSONB pour les calculs d'agrégation massifs (liste de courses).

---

## 📂 Décisions d'Architecture (Historique)
Pour comprendre l'évolution de la structure globale, voir [`docs/ARCHI.md`](docs/ARCHI.md).
