# UI/UX Guidelines — ThermoCook

Ce document définit les principes de design et les standards d'interface pour la plateforme ThermoCook. L'objectif est de créer une expérience **Premium**, **Calme** et **Optimisée pour la cuisine**.

---

## 🎨 1. Vision Esthétique : "Calm Culinary"

L'interface doit s'effacer devant le contenu (la recette). En cuisine, l'attention est une ressource limitée ; le design doit minimiser la charge cognitive.

### Principes Clés
- **Minimalisme Tactile** : Espaces blancs généreux, typographies larges, boutons massifs.
- **Profondeur & Hiérarchie** : Utilisation de l'élévation (shadows) et du *Glassmorphism* (effets de flou) pour détacher les éléments interactifs du fond.
- **Réalisme Organique** : Les images de nourriture sont les véritables protagonistes. Le reste de l'UI utilise des tons neutres et naturels.

---

## 🌈 2. Palette de Couleurs

| Rôle | Couleur | Code Hex | Usage |
|---|---|---|---|
| **Primaire** | Vert Thermomix | `#006d5b` | Actions principales, logos, accents. |
| **Accent** | Terre Cuite | `#d35400` | Alertes, timers actifs, notes importantes. |
| **Fond** | Perle | `#fdfdfd` | Couleur de fond principale de l'application. |
| **Surface** | Blanc Pur | `#ffffff` | Cartes, menus, zones de lecture. |
| **Texte** | Charbon | `#2c3e50` | Titres et corps de texte (lisibilité max). |
| **Bordure** | Gris Doux | `#ecf0f1` | Séparateurs, bordures légères. |

---

## typography 3. Typographie

- **Font Principale** : Sans-serif moderne (ex: *Inter*, *System UI*).
  - Titres : Bold, espacement serré.
  - Corps : Regular, interlignage généreux (`line-height: 1.6`).
- **Font Icônes** : `CulinaryIconfont` (woff2 local).
  - Utilisée pour rendre les tags `[STIR]`, `[VAROMA]`, etc.
  - Taille : `1.2em` pour s'aligner visuellement avec le texte.

---

## 📱 4. Layout & Responsivité

L'application est pensée **"Tablet-First"**, car c'est l'écran roi en cuisine.

### Desktop / Tablette (Paysage)
- **Master-Detail** : Liste des ingrédients fixée à gauche (30%), étapes défilantes à droite (70%).
- **Navigation Rail** : Barre latérale fine (64px) pour les icônes de navigation.

### Mobile / Tablette (Portrait)
- **Stack Vertical** : Image -> Ingrédients -> Étapes.
- **Bottom Navigation** : Barre d'onglets en bas pour un accès facile au pouce.

---

## 🍳 5. Mode "Cuisine" (Focus Mode)

État spécifique activé lors de la préparation d'une recette.
- **Wake Lock API** : Empêcher la mise en veille de l'écran.
- **Step-by-Step UI** : Une seule étape affichée à la fois en très grande taille.
- **Contrôles Géants** : Boutons "Précédent" et "Suivant" occupant toute la largeur du bas de l'écran.
- **Multi-Timers** : Widgets flottants pour suivre plusieurs cuissons en parallèle.

---

## 🧩 6. Composants Standards

### Boutons
- Taille min : `48px x 48px`.
- Rayon (Border-radius) : `12px` (Soft corners).
- Feedback : Changement d'état visuel immédiat au clic/touch.

### Cartes de Recette
- Image HD avec dégradé subtil pour le titre.
- Badge de difficulté et de temps visibles sans ouvrir la recette.
- Effet de survol (hover) : Élévation légère.

---

## ♿ 7. Accessibilité & PWA

- **Contraste** : Ratio minimum 4.5:1 pour tout texte informatif.
- **Offline-First** : Cache Service Worker pour les 20 dernières recettes consultées.
- **Installabilité** : Manifest PWA complet avec icônes maskables pour un rendu "natif" sur iOS et Android.
- **Touch Targets** : Jamais moins de `48px` d'écart entre deux éléments cliquables.
