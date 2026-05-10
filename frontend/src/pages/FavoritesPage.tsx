import React from 'react';
import { Heart } from 'lucide-react';
import { RecipeCard } from '../components/RecipeCard';
import { useFavoritesQuery } from '../hooks/queries/useRecipeQueries';

interface FavoritesPageProps {
  favorites: string[];
  isFavorite?: (id: string) => boolean;
  toggleFavorite?: (id: string) => void;
}

export const FavoritesPage: React.FC<FavoritesPageProps> = ({ isFavorite, toggleFavorite }) => {
  const { data: recipes = [], isLoading: loading } = useFavoritesQuery();

  if (loading) return <div className="p-20 text-center text-orange-500 font-bold">Récupération de vos coups de cœur...</div>;

  return (
    <div className="p-4 pb-20">
      <h2 className="text-2xl font-black text-gray-900 mb-6">Mes Favoris</h2>
      {recipes.length === 0 ? (
        <div className="p-20 text-center">
          <Heart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 italic">Vous n'avez pas encore de recettes favorites.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {recipes.map(r => (
            <RecipeCard key={r.id} recipe={r} isFav={isFavorite?.(r.id)} onToggleFav={toggleFavorite} />
          ))}
        </div>
      )}
    </div>
  );
};
