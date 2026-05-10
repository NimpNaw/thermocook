import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { ArrowDownAZ, ArrowUpZA, Shuffle } from 'lucide-react';
import { RecipeCard } from '../components/RecipeCard';
import { useRecipesInfiniteQuery } from '../hooks/queries/useRecipeQueries';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { CATEGORIES } from '../constants/categories';

interface RecipesPageProps {
  isFavorite?: (id: string) => boolean;
  toggleFavorite?: (id: string) => void;
  isActive?: boolean;
}

const SORT_OPTIONS = [
  { value: 'random', label: 'Aléatoire', Icon: Shuffle },
  { value: 'name_asc', label: 'A → Z', Icon: ArrowDownAZ },
  { value: 'name_desc', label: 'Z → A', Icon: ArrowUpZA },
];

const LIMIT = 40;

export const RecipesPage: React.FC<RecipesPageProps> = ({ isFavorite, toggleFavorite, isActive = true }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? undefined;
  const sort = searchParams.get('sort') ?? 'random';
  useScrollRestoration(undefined, { enabled: isActive });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useRecipesInfiniteQuery(category, sort, LIMIT, isActive);

  const recipes = data?.pages.flat() || [];
  
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: fetchNextPage,
    enabled: hasNextPage && !isFetchingNextPage,
  });

  const selectCategory = (cat: string | undefined) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (cat) next.set('category', cat);
      else next.delete('category');
      return next;
    });
  };

  const selectSort = (s: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sort', s);
      return next;
    });
  };

  return (
    <div className="p-4 pb-20">
      {/* Chips catégories */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
        <button
          onClick={() => selectCategory(undefined)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            !category
              ? 'bg-[#006d5b] text-white border-[#006d5b]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-[#006d5b]'
          }`}
        >
          Tout
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.label}
            onClick={() => selectCategory(category === cat.label ? undefined : cat.label)}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              category === cat.label
                ? 'bg-[#006d5b] text-white border-[#006d5b]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#006d5b]'
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Titre + sélecteur de tri */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black text-gray-900">
          {category ?? 'Catalogue complet'}
        </h2>
        <div className="flex gap-1">
          {SORT_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => selectSort(value)}
              title={label}
              className={`p-2 rounded-xl transition-colors ${
                sort === value
                  ? 'bg-[#006d5b] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* Grille */}
      {isLoading && recipes.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(8)].map((_, i) => <div key={i} className="bg-gray-200 aspect-square rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {recipes.map(r => (
            <RecipeCard key={r.id} recipe={r} isFav={isFavorite?.(r.id)} onToggleFav={toggleFavorite} />
          ))}
        </div>
      )}

      {/* Sentinel pour le défilement infini */}
      <div ref={sentinelRef} className="h-20 flex items-center justify-center">
        {(isLoading || isFetchingNextPage) && (
          <div className="flex items-center gap-2 text-[#006d5b] animate-pulse">
            <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            <span className="text-sm font-medium ml-2">Chargement...</span>
          </div>
        )}
        {!hasNextPage && recipes.length > 0 && (
          <p className="text-gray-400 text-sm italic">Fin du catalogue</p>
        )}
      </div>
    </div>
  );
};
