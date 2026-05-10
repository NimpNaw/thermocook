export const CATEGORIES = [
  { label: 'Entrée', emoji: '🥗', color: 'bg-green-50 text-green-700 border-green-200' },
  { label: 'Plat principal', emoji: '🍽️', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { label: 'Dessert', emoji: '🍰', color: 'bg-pink-50 text-pink-700 border-pink-200' },
  { label: 'Apéritif', emoji: '🥂', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { label: 'Boisson', emoji: '🥤', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { label: 'Accompagnement', emoji: '🥦', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: 'Soupe', emoji: '🍲', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Petit-déjeuner', emoji: '🥐', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { label: 'Divers', emoji: '🍴', color: 'bg-gray-50 text-gray-600 border-gray-200' },
] as const;

// Catégories d'ingrédients pour la liste de courses (ordonnées selon le parcours
// type d'un magasin). Utilisée par ShoppingListPage et SharedListPage.
export const SHOPPING_CATEGORIES: { key: string; emoji: string }[] = [
  { key: 'Fruits & Légumes', emoji: '🥦' },
  { key: 'Crémerie',         emoji: '🧀' },
  { key: 'Boucherie',        emoji: '🥩' },
  { key: 'Poissonnerie',     emoji: '🐟' },
  { key: 'Épicerie',         emoji: '🧂' },
  { key: 'Divers',           emoji: '📦' },
];
