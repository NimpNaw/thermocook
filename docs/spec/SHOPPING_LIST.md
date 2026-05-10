# Liste de Courses — Spécifications

## Principe

La liste de courses regroupe les ingrédients des recettes que l'utilisateur a ajoutées manuellement. Les articles sont organisés par **Rayon** pour optimiser le parcours en magasin.

> [!NOTE]
> **Pas de Fusion Numérique** : Pour garantir la traçabilité, les ingrédients ne sont pas additionnés mathématiquement (ex: "2 carottes" + "3 carottes" restent deux lignes distinctes sous le même rayon) afin de savoir quel produit appartient à quelle recette.

---

## Fonctionnalités Clés

### 1. Gestion des Recettes (Bandeau)
- Un bandeau en haut de page affiche chaque recette présente dans la liste sous forme de badge.
- Cliquer sur la croix d'un badge retire instantanément tous les ingrédients liés à cette recette.

### 2. Gestion Granulaire (Exclusions)
- Chaque ingrédient peut être retiré individuellement via une icône poubelle.
- Cette suppression est **persistante** (stockée en base de données).
- **Restauration** : Si l'utilisateur ajoute à nouveau la même recette depuis sa fiche descriptive, tous les ingrédients précédemment exclus sont restaurés.

### 3. Partage & Mode Invité
- **Génération de lien** : Un bouton permet de générer un lien unique (UUID).
- **Validité** : Les liens expirent automatiquement après **7 jours**.
- **Accès Public** : Le destinataire accède à une vue simplifiée (sans authentification).
- **Support Offline (PWA)** :
    - Les données sont mises en cache dans le `localStorage` de l'invité.
    - L'état des cases à cocher est persisté localement sur l'appareil du destinataire.
    - Fonctionne en magasin même sans connexion internet.

---

## Rayons (Catégories d'Ingrédients)

| Rayon | Exemples de produits |
|---|---|
| 🥦 **Fruits & Légumes** | carotte, oignon, tomate, herbes fraîches... |
| 🧀 **Crémerie** | lait, beurre, fromage, œufs... |
| 🥩 **Boucherie** | poulet, bœuf, porc, charcuterie... |
| 🐟 **Poissonnerie** | poisson, crevettes, coquillages... |
| 🧂 **Épicerie** | farine, sucre, huile, épices, conserves... |
| 📦 **Divers** | Tout produit non reconnu |

---

## Architecture Technique

### Endpoints API
- `GET /shopping-list` : Liste complète (catégories + recettes actives).
- `POST /shopping-list/add` : Ajoute une recette (idempotent, nettoie les exclusions).
- `POST /shopping-list/exclude` : Exclut un ingrédient spécifique d'une recette.
- `POST /shopping-list/share` : Génère un token de partage.
- `GET /shared-list/{token}` : Accès public (Rate limited).

### Modèles de données
- `MealPlan` : Utilisé avec `meal_type="shopping_list"` comme table de jointure.
- `ShoppingListExclusion` : Stocke les couples (user, recipe, ingredient_raw) à masquer.
- `SharedLink` : Stocke les tokens UUID et leur date d'expiration.
