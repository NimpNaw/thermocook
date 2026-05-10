import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSearchStore } from '../store/useSearchStore';

import { Heart, ChefHat, ArrowLeft, Play, NotebookPen, Save, Check, ShoppingCart } from 'lucide-react';
import { api } from '../api';
import { FormattedText } from '../components/FormattedText';
import { ErrorMessage } from '../components/ErrorMessage';
import { cleanIngredient, splitIngredient, formatTime } from '../utils/formatters';
import { useToastContext } from '../context/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { RecipeImage } from '../components/RecipeImage';
import { useRecipeQuery, useAddToShoppingListMutation } from '../hooks/queries/useRecipeQueries';

interface RecipeDetailPageProps {
  isFav?: (id: string) => boolean;
  onToggleFav?: (id: string) => void;
}

export const RecipeDetailPage: React.FC<RecipeDetailPageProps> = ({ isFav, onToggleFav }) => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: recipe, isLoading: loading, error: queryError } = useRecipeQuery(id);
  const addToShoppingListMutation = useAddToShoppingListMutation();

  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [shoppingAdded, setShoppingAdded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setSearchQuery } = useSearchStore();
  const showToast = useToastContext();

  // Resynchronise le store Zustand depuis location.state au montage —
  // nécessaire après rechargement de page (window.history.state survit,
  // mais le store en mémoire est réinitialisé).
  useEffect(() => {
    const state = location.state as { fromSearch?: string } | null;
    if (state?.fromSearch) setSearchQuery(state.fromSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    const state = location.state as { from?: string } | null;
    if (state?.from === 'internal') {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (id && user) {
      api.getNote(id).then(setNote).catch(() => {});
    }
  }, [id, user]);

  const handleSaveNote = async () => {
    if (!id) return;
    await api.saveNote(id, note);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const handleAddToShoppingList = async () => {
    if (!id) return;
    try {
      await addToShoppingListMutation.mutateAsync(id);
      setShoppingAdded(true);
      showToast('Recette ajoutée à la liste de courses !');
      setTimeout(() => setShoppingAdded(false), 2000);
    } catch {
      showToast('Impossible d\'ajouter à la liste. Êtes-vous connecté ?');
    }
  };

  if (loading) return <div className="p-20 text-center animate-bounce text-orange-500 font-bold text-xl">👨‍🍳 Préparation du plan de travail...</div>;
  if (queryError || !recipe) return <ErrorMessage message={(queryError as any)?.message || "Recette introuvable"} />;

  const folder = recipe.folder_name || `${recipe.slug}_${recipe.id}`;
  const active = isFav?.(recipe.id) ?? false;

  const processedSteps: { type: 'step' | 'title', text: string }[] = [];
  recipe.steps_json?.forEach(step => {
    const lines = step.text.split(/(\n*#{1,3}\s+.+)/g);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.match(/^#{1,3}\s+/)) { 
        processedSteps.push({ type: 'title', text: trimmed.replace(/^#{1,3}\s+/, '').trim() }); 
      } else { 
        processedSteps.push({ type: 'step', text: trimmed }); 
      }
    });
  });

  let stepCounter = 1;

  return (
    <div className="bg-white min-h-screen pb-20">
      <button onClick={handleBack} className="fixed top-4 left-4 z-50 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg text-gray-800"><ArrowLeft size={24} /></button>
      {onToggleFav && (
        <button onClick={() => onToggleFav(recipe.id)} className={`fixed top-4 right-4 z-50 p-3 rounded-full shadow-lg transition-colors ${active ? 'bg-orange-500 text-white' : 'bg-white/80 text-gray-400'}`}><Heart size={24} fill={active ? 'currentColor' : 'none'} strokeWidth={2.5} /></button>
      )}

      <div className="w-full h-72 md:h-[400px] relative bg-orange-100">
        {recipe.image_main ? (
          <RecipeImage
            folder={folder}
            filename={recipe.image_main}
            size="medium"
            dominantColor={recipe.dominant_color}
            alt={recipe.title}
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-orange-200"><ChefHat size={120} /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        <div className="absolute bottom-12 left-6 right-6">
          <h1 className="text-2xl md:text-4xl font-black text-white leading-tight drop-shadow-md">
            {recipe.title}
          </h1>
        </div>
      </div>

      <div className="px-6 -mt-6 relative z-10 mb-4 space-y-3">
        <button
          onClick={() => navigate(`/recipes/${recipe.id}/cooking`)}
          className="w-full py-4 bg-[#006d5b] text-white rounded-2xl font-black shadow-xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform active:scale-95"
        >
          <Play size={24} fill="currentColor" /> COMMENCER LA CUISINE
        </button>

        {user && (
          <div className="space-y-2">
            <button
              onClick={handleAddToShoppingList}
              disabled={shoppingAdded}
              className="w-full py-3 bg-white border-2 border-green-200 text-green-700 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-green-50 transition-colors disabled:opacity-70"
            >
              {shoppingAdded ? <Check size={20} /> : <ShoppingCart size={20} />}
              {shoppingAdded ? 'Ajouté !' : 'Ajouter à la liste de courses'}
            </button>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center py-6 border-b border-gray-100 mb-8">
          <div className="flex flex-col items-center"><span className="text-[10px] uppercase text-gray-400 font-bold">Difficulté</span><span className="font-bold text-gray-800 text-sm">{recipe.difficulty || 'Facile'}</span></div>
          <div className="w-px h-8 bg-gray-100"></div>
          {recipe.category && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-400 font-bold">Catégorie</span>
                <span className="font-bold text-orange-600 text-sm">{recipe.category}</span>
              </div>
              <div className="w-px h-8 bg-gray-100"></div>
            </>
          )}
          <div className="flex flex-col items-center"><span className="text-[10px] uppercase text-gray-400 font-bold">Préparation</span><span className="font-bold text-gray-800 text-sm">{recipe.total_time ? formatTime(recipe.total_time) : '--'}</span></div>
          <div className="w-px h-8 bg-gray-100"></div>
          <div className="flex flex-col items-center"><span className="text-[10px] uppercase text-gray-400 font-bold">Portions</span><span className="font-bold text-gray-800 text-sm">{recipe.portions || '--'}</span></div>
        </div>

        <section className="mb-10">
          <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2"><span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center text-sm">🥗</span>Ingrédients</h2>
          <ul className="ingredient-list">
            {recipe.ingredients_json?.map((ing, idx) => {
              const { main, precision } = splitIngredient(cleanIngredient(ing.raw));
              return (
                <li key={idx} className="ingredient-item text-gray-700">
                  <span className="text-orange-400 font-bold">•</span>
                  <span className="leading-tight text-sm">
                    <span className="font-medium"><FormattedText text={main} folder={folder} /></span>
                    {precision && <span className="block text-xs text-gray-400 mt-0.5 italic"><FormattedText text={precision} folder={folder} /></span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2"><span className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center text-sm">👨‍🍳</span>Préparation</h2>
          {processedSteps.length === 0 ? (
            <p className="text-gray-400 italic text-sm">Aucune étape de préparation disponible pour cette recette.</p>
          ) : (
            <div className="space-y-4 relative before:absolute before:left-4 before:top-4 before:bottom-0 before:w-0.5 before:bg-green-50">
              {processedSteps.map((step, idx) => {
                if (step.type === 'title') {
                  return (
                    <div key={idx} className="relative z-10 bg-white py-2">
                      <h4 className="text-orange-700 font-black text-xs uppercase tracking-widest mt-6 mb-2 border-l-4 border-orange-500 pl-3">{step.text}</h4>
                    </div>
                  );
                }
                const currentStep = stepCounter++;
                return (
                  <div key={idx} className="relative pl-12">
                    <div className="absolute left-0 top-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-sm">{currentStep}</div>
                    <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm hover:border-green-200 transition-colors text-sm md:text-base">
                      <FormattedText text={step.text} folder={folder} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {user && (
          <section className="mb-10">
            <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center text-sm">
                <NotebookPen size={16} />
              </span>
              Mes notes
            </h2>
            <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ajoutez vos astuces, modifications, conseils..."
                className="w-full bg-white border border-purple-100 rounded-xl p-3 text-sm text-gray-700 resize-none focus:ring-2 focus:ring-purple-400 outline-none min-h-[100px]"
              />
              <button
                onClick={handleSaveNote}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors"
              >
                <Save size={14} />
                {noteSaved ? 'Sauvegardé !' : 'Sauvegarder'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
