# 🖥️ Structure des Pages

Ce document décrit l'organisation des pages de l'application ThermoCook, leurs routes respectives et leurs fonctionnalités principales.

---

## 🧭 Navigation Principale

L'application utilise une navigation hybride adaptée aux mobiles et tablettes :
- **Barre de Navigation Inférieure (`BottomNav`)** : Accès rapide aux sections clés (Accueil, Recettes, Favoris, Courses).
- **En-tête (`Header`)** : Présent sur la plupart des pages privées, contient la barre de recherche globale et l'accès au profil/administration.

---

## 📄 Liste des Pages

### 1. Accueil (`/`)
*   **But** : Offrir une vue d'ensemble et un accès rapide aux recettes du moment.
*   **Contenu** :
    *   **Suggestions Saisonnières** : Sélection aléatoire de recettes basées sur les ingrédients de saison (fruits, légumes, produits de la pêche) en France.
    *   **À Découvrir** : Sélection aléatoire globale pour explorer le catalogue.
    *   **Raccourcis Catégories** : Accès direct aux types de plats (Entrées, Plats, etc.).
*   **Actions** : Recherche globale, filtrage par saison, clic sur une recette.

### 2. Catalogue de Recettes (`/recipes`)
*   **But** : Explorer l'intégralité de la bibliothèque.
*   **Fonctionnalités** :
    *   Recherche textuelle (Voir [**`SEARCH_ENGINE.md`**](SEARCH_ENGINE.md)).
    *   Filtrage par catégorie (Entrée, Plat, Dessert, etc.).
    *   Tri (Alphabétique, Date d'ajout).
    *   Affichage en grille de vignettes.

### 3. Détail d'une Recette (`/recipes/:id`)
*   **But** : Consulter toutes les informations d'une préparation.
*   **Contenu** :
    *   Image haute définition.
    *   Informations (Temps, Difficulté, Portions).
    *   Liste des ingrédients normalisée.
    *   Étapes de préparation détaillées.
    *   Notes personnelles et astuces.
*   **Actions** : Ajouter aux favoris, ajouter à la liste de courses, lancer le **Mode Cuisine**.

### 4. Mode Cuisine (`/recipes/:id/cooking`)
*   **But** : Guider l'utilisateur pendant la réalisation.
*   **Interface** :
    *   Affichage plein écran (Immersion).
    *   Navigation étape par étape (Swipe ou flèches).
    *   Minuteurs interactifs (déclenchables en un clic).
    *   **Wake Lock** : Empêche l'écran de se mettre en veille.

### 5. Liste de Courses (`/shopping-list`)
*   **But** : Faciliter les achats.
*   **Fonctionnalités** :
    *   Groupage automatique par rayons (Crémerie, Épicerie, etc.).
    *   **Bandeau Recettes** : Visualisation des recettes actives sous forme de badges rétractables.
    *   Case à cocher pour rayer les articles.
    *   **Gestion granulaire** : Suppression d'un ingrédient spécifique ou d'une recette entière.
    *   **Partage** : Génération d'un lien public pour usage externe.

### 6. Vue Partagée (`/shared/:token`)
*   **But** : Permettre à un invité de consulter et cocher la liste.
*   **Caractéristiques** :
    *   Accès public (sans compte).
    *   Design épuré (pas de navigation).
    *   **Mode Offline** : Persistance locale des données et des coches pour usage en magasin sans réseau.

### 7. Favoris (`/favorites`)
*   **But** : Accès direct aux recettes préférées.
*   **Contenu** : Grille de toutes les recettes marquées comme "Cœur".
*   **Temps réel** : La suppression d'un favori retire la carte immédiatement (mise à jour optimiste du cache TanStack Query). L'ajout d'un favori déclenche un rechargement automatique au prochain affichage de la page.
*   **Visibilité** : Le menu Favoris, le menu Courses et toutes les icônes cœur sur les cartes et fiches recettes sont masqués lorsque l'utilisateur n'est pas connecté.

### 8. Profil & Administration (`/profile` & `/admin`)
*   **Profil** : Statistiques d'utilisation, changement de mot de passe, déconnexion.
*   **Administration** (Admin uniquement) :
    *   **Import** : Ajout de nouvelles recettes via URL ou fichier avec suivi de progression.
    *   **Indexation** : Synchronisation manuelle (Ajout/MAJ/Suppression) basée sur l'ID des recettes, avec nettoyage des données utilisateurs liées.
    *   **Logs** : Indicateur d'erreurs d'importation via un **badge** sur l'interface.
