import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Share2, Trash2, BookOpen, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToastContext } from '../context/ToastContext';
import { useShoppingListQuery, useRemoveRecipeFromShoppingListMutation, useExcludeIngredientFromShoppingListMutation } from '../hooks/queries/useRecipeQueries';
import { SHOPPING_CATEGORIES as CATEGORY_CONFIG } from '../constants/categories';

export const ShoppingListPage: React.FC = () => {
  const { data, isLoading: loading } = useShoppingListQuery();
  const removeRecipeMutation = useRemoveRecipeFromShoppingListMutation();
  const excludeIngredientMutation = useExcludeIngredientFromShoppingListMutation();
  
  const categories = data?.categories || {};
  const recipes = data?.recipes || [];
  
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const showToast = useToastContext();

  const toggleCheck = (key: string) =>
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  const handleRemoveRecipe = async (recipeId: string, recipeName: string) => {
    try {
      await removeRecipeMutation.mutateAsync(recipeId);
      showToast(`"${recipeName}" retiré de la liste`);
    } catch {
      showToast('Impossible de supprimer cette recette.');
    }
  };

  const handleExcludeIngredient = async (recipeId: string, ingredientRaw: string, ingredientText: string) => {
    try {
      await excludeIngredientMutation.mutateAsync({ recipeId, raw: ingredientRaw });
      showToast(`"${ingredientText}" retiré`);
    } catch {
      showToast('Impossible de retirer cet ingrédient.');
    }
  };

  const shareList = async () => {
    try {
      const { token } = await api.shareShoppingList();
      const url = `${window.location.origin}/shared/${token}`;
      
      // 1. Tentative de partage natif (Mobile)
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Ma liste de courses ThermoCook', url: url });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }
      
      // 2. Tentative de copie moderne (Clipboard API)
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(url);
          showToast('Lien copié dans le presse-papier !', 'success');
          return;
        } catch (err) {
          // Échec Clipboard API, on tente le fallback
        }
      }

      // 3. Fallback universel (TextArea + execCommand)
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showToast('Lien copié dans le presse-papier !', 'success');
        } else {
          showToast(`Lien généré : ${url}`);
        }
      } catch (err) {
        showToast(`Lien généré : ${url}`);
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (err) {
      showToast('Erreur lors du partage. Veuillez réessayer.');
    }
  };

  const isEmpty = Object.keys(categories).length === 0;

  return (
    <div className="bg-white min-h-screen pb-24">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400"><ArrowLeft /></button>
        <h2 className="text-lg font-black text-gray-900 uppercase">Liste de courses</h2>
        <button onClick={shareList} className="p-2 text-orange-600"><Share2 size={20} /></button>
      </div>

      {/* Bandeau des recettes */}
      {!loading && recipes.length > 0 && (
        <div className="p-4 bg-gray-50 border-b border-gray-100 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {recipes.map(r => (
              <div key={r.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-orange-100 shadow-sm">
                <BookOpen size={14} className="text-orange-400" />
                <span className="text-xs font-bold text-gray-700 max-w-[120px] truncate">{r.title}</span>
                <button 
                  onClick={() => handleRemoveRecipe(r.id, r.title)}
                  className="p-0.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4">
        {loading ? (
          <div className="text-center p-20 text-gray-400 animate-pulse font-bold">Préparation de la liste...</div>
        ) : isEmpty ? (
          <div className="text-center p-20">
            <p className="text-gray-400 italic">Aucun ingrédient pour le moment. Ajoutez des recettes depuis une fiche recette !</p>
          </div>
        ) : (
          <div className="space-y-6">
            {CATEGORY_CONFIG.filter(c => categories[c.key]?.length).map(({ key, emoji }) => (
              <div key={key}>
                <h3 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                  <span>{emoji}</span>{key}
                </h3>
                <div className="space-y-2">
                  {categories[key].map((item, idx) => {
                    const checkKey = `${key}-${idx}`;
                    return (
                      <div
                        key={checkKey}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${checked[checkKey] ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-white border-orange-50 shadow-sm'}`}
                      >
                        <button onClick={() => toggleCheck(checkKey)} className="shrink-0">
                          {checked[checkKey]
                            ? <CheckCircle2 className="text-green-500" size={18} />
                            : <Circle className="text-orange-300" size={18} />
                          }
                        </button>
                        <span className={`text-sm font-medium flex-1 ${checked[checkKey] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {item.text}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-gray-400 truncate max-w-[80px] italic">{item.recipe}</span>
                          <button
                            onClick={() => handleExcludeIngredient(item.recipe_id, item.raw, item.text)}
                            className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                            title={`Retirer l'ingrédient`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
