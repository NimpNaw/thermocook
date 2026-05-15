import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ChefHat, Clock, Users } from 'lucide-react';
import { Recipe } from '../api';
import { RecipeImage } from './RecipeImage';
import { formatTime } from '../utils/formatters';
import { useSearchStore } from '../store/useSearchStore';

interface RecipeCardProps {
  recipe: Recipe;
  isFav?: boolean;
  onToggleFav?: (id: string) => void;
}

const RecipeCardComponent: React.FC<RecipeCardProps> = ({ recipe, isFav, onToggleFav }) => {
  const navigate = useNavigate();
  const { searchQuery } = useSearchStore();
  const folder = recipe.folder_name || `${recipe.slug}_${recipe.id}`;

  const handleNavigate = () => {
    const state: Record<string, string> = { from: 'internal' };
    if (searchQuery.trim().length > 2) state.fromSearch = searchQuery;
    navigate(`/recipes/${recipe.id}`, { state });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer relative [content-visibility:auto] [contain-intrinsic-size:280px]">
      {onToggleFav && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(recipe.id); }}
          className={`absolute top-2 left-2 z-10 p-2 rounded-full backdrop-blur-md transition-colors ${isFav ? 'bg-orange-500 text-white' : 'bg-white/80 text-gray-400'}`}
        >
          <Heart size={16} fill={isFav ? 'currentColor' : 'none'} strokeWidth={2.5} />
        </button>
      )}
      <div onClick={handleNavigate}>
        <div className="aspect-video relative overflow-hidden">
          {recipe.image_main ? (
            <RecipeImage
              folder={folder}
              filename={recipe.image_main}
              size="thumb"
              dominantColor={recipe.dominant_color}
              alt={recipe.title}
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full bg-orange-100 flex items-center justify-center text-orange-300">
              <ChefHat size={48} />
            </div>
          )}
          <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-[10px] font-bold text-orange-700 shadow-sm uppercase">
            {recipe.difficulty || 'Facile'}
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-bold text-gray-800 line-clamp-2 min-h-[2.5em] leading-tight mb-2 text-sm md:text-base">{recipe.title}</h3>
          <div className="flex items-center gap-4 text-gray-500 text-[10px] md:text-xs">
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span>{recipe.total_time ? formatTime(recipe.total_time) : '--'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users size={12} />
              <span>{recipe.portions || '--'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RecipeCard = React.memo(RecipeCardComponent);
