# 📝 Spécifications Fonctionnelles

> **But :** Définition des fonctionnalités métier et du comportement attendu du logiciel.
> **Contenu :** Liste des fonctionnalités de base (Mode Cuisine, Planning, etc.) et liens vers les spécifications détaillées (`docs/spec/`).

Ce document centralise les spécifications métier de l'application ThermoCook. Il définit ce que le logiciel doit faire pour répondre aux besoins des utilisateurs.

---

## 🍱 Fonctionnalités de Base

### 1. Gestion des Recettes
- **Consultation** : Affichage clair des titres, ingrédients et étapes.
- **Scroll Infini** : Chargement automatique par lots de 40 recettes au défilement (Catalogue et Recherche).
- **Catégories** : Classification selon 9 valeurs canoniques (`Entrée`, `Plat principal`, `Dessert`, `Apéritif`, `Boisson`, `Accompagnement`, `Soupe`, `Petit-déjeuner`, `Divers`).
- **Recherche FTS** : Moteur de recherche par pertinence (Titres > Ingrédients).
- **Favoris** : Mise en favoris synchronisée avec le compte utilisateur. L'ajout et la suppression d'un favori sont reflétés **immédiatement** dans l'interface sans rechargement de page (mise à jour optimiste du cache côté client). Les icônes favoris (cœur) et les entrées de navigation "Favoris" et "Courses" sont **masquées pour les utilisateurs non connectés**.
- **Notes** : Possibilité d'ajouter des astuces personnelles sur chaque recette.
- **Navigation contextuelle (Retour)** : Le bouton retour d'une fiche recette adopte un comportement intelligent selon le contexte d'arrivée :
  - Arrivée depuis le catalogue ou les favoris → retour à la page précédente (filtre et tri conservés dans l'URL).
  - Arrivée depuis l'overlay de recherche → restauration de la requête et retour à l'overlay.
  - Arrivée directe (lien externe, favori navigateur) → redirection vers l'accueil (`/`).

### 2. Mode Cuisine & Rendu
- **Optimisation Images** : Génération à la volée de miniatures WebP (`400px` pour les vignettes, `800px` pour le détail).
- **Placeholder intelligent** : Extraction de la couleur dominante de l'image pour affichage d'un fond coloré pendant le chargement (effet fade-in).
- **Interface Step-by-Step** : Navigation en plein écran optimisée pour tablette/mobile.
- **Réglages Thermomix** : Les blocs `{durée/température/vitesse}` dans les étapes sont rendus avec une mise en forme dédiée (icônes, fond coloré). Les mots-clés de mode (`Varoma`, `pétrin`, `inverse`, `mijotage`, `turbo`) sont reconnus directement à l'intérieur des blocs `{}` — aucun tag spécial n'est nécessaire.
- **Minuteurs** : Détection automatique des durées dans les blocs de réglages et interface interactive.
- **Wake Lock** : Maintien de l'écran allumé via la `Screen Wake Lock API`.

### 3. Liste de Courses
- **Normalisation** : Nettoyage des textes d'ingrédients et exclusion du matériel.
- **Groupement par Rayons** : Organisation automatique par catégories d'ingrédients (ex: Crémerie, Épicerie).
- **Gestion Granulaire** : Possibilité de retirer des ingrédients individuellement ou par recette (badge).
- **Restauration** : Ré-ajouter une recette restaure tous ses ingrédients précédemment exclus.
- **Partage** : Génération de liens de partage (UUID) valables 7 jours.
- **Accès Invité** : Vue publique optimisée avec support du mode hors-ligne pour un usage en magasin.


### 4. Administration
- **Import/Export** : Importation d'archives de recettes (`.tar.gz` ou `.zip`) via URL ou chemin local avec suivi de progression en temps réel.
- **Indexation Manuelle** : Synchronisation du dossier local `data/recipes/` vers la base de données.
- **Gestion Users** : Création et administration des comptes (Admin/Standard).


---

## 📂 Spécifications Détailées

| Domaine | Fichier de Spécification |
|---|---|
| **Structure des Pages** | [`docs/spec/PAGES.md`](spec/PAGES.md) |
| **Format de Données** | [`docs/spec/RECIPE_FORMAT.md`](spec/RECIPE_FORMAT.md) |
| **Import / Packaging** | [`docs/spec/RECIPE_PACKAGING.md`](spec/RECIPE_PACKAGING.md) |
| **Moteur de Recherche** | [`docs/spec/SEARCH_ENGINE.md`](spec/SEARCH_ENGINE.md) |
| **Liste de Courses** | [`docs/spec/SHOPPING_LIST.md`](spec/SHOPPING_LIST.md) |
| **UI/UX** | [`docs/spec/UI_GUIDELINES.md`](spec/UI_GUIDELINES.md) |
