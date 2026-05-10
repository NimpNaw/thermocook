import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, Leaf, LayoutGrid, Shuffle } from 'lucide-react';
import { User } from '../api';
import { RecipeCard } from '../components/RecipeCard';
import { useRecipesSeasonalQuery, useRecipesRandomQuery, useAdminAlertsQuery } from '../hooks/queries/useRecipeQueries';
import { CATEGORIES } from '../constants/categories';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

interface HomePageProps {
  isFavorite?: (id: string) => boolean;
  toggleFavorite?: (id: string) => void;
  currentUser?: User | null;
}

export const HomePage: React.FC<HomePageProps> = ({ isFavorite, toggleFavorite, currentUser }) => {
  const navigate = useNavigate();
  
  const { data: seasonal = [], isLoading: loadingSeasonal } = useRecipesSeasonalQuery(6);
  const { data: random = [], isLoading: loadingRandom, refetch: fetchRandom, isFetching: isRefetchingRandom } = useRecipesRandomQuery(6);
  const { data: alerts } = useAdminAlertsQuery(!!currentUser?.is_admin);
  
  const unresolvedErrors = alerts?.unresolved_errors || 0;
  const currentMonth = new Date().getMonth();

  const handleCategoryClick = (category: string) => {
    navigate(`/recipes?category=${encodeURIComponent(category)}`);
  };

  const handleRefreshRandom = () => {
    fetchRandom();
  };

  return (
    <div className="p-4 space-y-8">
      {/* Bandeau d'alerte admin */}
      {currentUser?.is_admin && unresolvedErrors > 0 && (
        <button
          onClick={() => navigate('/admin')}
          className="w-full flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-red-100 transition-colors text-left"
        >
          <AlertTriangle size={18} className="shrink-0" />
          <span>
            {unresolvedErrors} erreur{unresolvedErrors > 1 ? 's' : ''} d'import non résolue{unresolvedErrors > 1 ? 's' : ''} — voir l'administration
          </span>
        </button>
      )}

      {/* Section Saisonnalité */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Leaf size={18} className="text-green-600" />
          <h2 className="text-lg font-black text-gray-900">C'est la saison !</h2>
          <span className="text-sm text-gray-400 font-medium">{MONTH_NAMES[currentMonth]}</span>
        </div>
        {loadingSeasonal ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="bg-gray-200 aspect-square rounded-2xl" />)}
          </div>
        ) : seasonal.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {seasonal.map(r => (
              <RecipeCard key={r.id} recipe={r} isFav={isFavorite?.(r.id)} onToggleFav={toggleFavorite} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Aucune recette de saison trouvée pour ce mois.</p>
        )}
      </section>

      {/* Section Catégories */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid size={18} className="text-orange-500" />
          <h2 className="text-lg font-black text-gray-900">Parcourir</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.label}
              onClick={() => handleCategoryClick(cat.label)}
              className={`flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-2xl border text-xs font-bold transition-colors hover:opacity-80 ${cat.color}`}
            >
              <span className="text-xl">{cat.emoji}</span>
              <span className="text-center leading-tight">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Section Aléatoire */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shuffle size={18} className="text-purple-500" />
            <h2 className="text-lg font-black text-gray-900">À découvrir</h2>
          </div>
          <button
            onClick={handleRefreshRandom}
            disabled={isRefetchingRandom}
            className="p-2 text-orange-600 hover:bg-orange-50 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isRefetchingRandom ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loadingRandom ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="bg-gray-200 aspect-square rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {random.map(r => (
              <RecipeCard key={r.id} recipe={r} isFav={isFavorite?.(r.id)} onToggleFav={toggleFavorite} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
