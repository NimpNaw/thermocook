import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ShoppingCart, WifiOff } from 'lucide-react';
import { useToastContext } from '../context/ToastContext';
import { SHOPPING_CATEGORIES as CATEGORY_CONFIG } from '../constants/categories';

type ShoppingItem = { text: string; recipe: string; recipe_id: string; raw: string };

export const SharedListPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [categories, setCategories] = useState<Record<string, ShoppingItem[]>>({});
  const [owner, setOwner] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const showToast = useToastContext();

  const cacheKeyData = `tc_shared_list_${token}`;
  const cacheKeyChecked = `tc_shared_checked_${token}`;

  const loadList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // On fait l'appel directement ici pour gérer finement les statuts HTTP
      const response = await fetch(`/api/shared-list/${token}`);
      
      if (response.status === 403 || response.status === 404) {
        showToast('Lien expiré ou introuvable');
        setCategories({});
        setLoading(false);
        return;
      }

      if (!response.ok) throw new Error('Erreur réseau');

      const data = await response.json();
      setCategories(data.categories);
      setOwner(data.owner);
      localStorage.setItem(cacheKeyData, JSON.stringify(data));
      setOffline(false);
    } catch (err) {
      // Tentative de chargement depuis le cache uniquement pour les erreurs réseau
      const cached = localStorage.getItem(cacheKeyData);
      if (cached) {
        const data = JSON.parse(cached);
        // Vérification de l'expiration locale
        if (data.expires_at && new Date() > new Date(data.expires_at)) {
          showToast('Ce lien a expiré');
          setCategories({});
          return;
        }
        setCategories(data.categories);
        setOwner(data.owner);
        setOffline(true);
        showToast('Affichage de la version hors-ligne');
      } else {
        showToast('Impossible de charger la liste.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, cacheKeyData, showToast]);

  useEffect(() => {
    loadList();
    // Charger les coches locales
    const savedChecked = localStorage.getItem(cacheKeyChecked);
    if (savedChecked) setChecked(JSON.parse(savedChecked));
  }, [loadList, cacheKeyChecked]);

  const toggleCheck = (id: string) => {
    const newChecked = { ...checked, [id]: !checked[id] };
    setChecked(newChecked);
    localStorage.setItem(cacheKeyChecked, JSON.stringify(newChecked));
  };

  const isEmpty = Object.keys(categories).length === 0;

  return (
    <div className="bg-white min-h-screen pb-24">
      <div className="p-6 bg-gradient-to-br from-[#006d5b] to-[#004d40] text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
            <ShoppingCart size={24} />
          </div>
          {offline && (
            <div className="flex items-center gap-1 bg-orange-500/80 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <WifiOff size={12} /> Hors-ligne
            </div>
          )}
        </div>
        <h1 className="text-2xl font-black mb-1">Liste de courses</h1>
        <p className="text-white/70 text-sm font-medium">Partagée par <span className="text-white font-bold">{owner || 'un ami'}</span></p>
      </div>

      <div className="p-4">
        {loading && !Object.keys(categories).length ? (
          <div className="text-center p-20 text-gray-400 animate-pulse font-bold italic">Ouverture du paquet...</div>
        ) : isEmpty ? (
          <div className="text-center p-20">
            <p className="text-gray-400 italic">Cette liste est vide ou n'existe plus.</p>
          </div>
        ) : (
          <div className="space-y-8 mt-2">
            {CATEGORY_CONFIG.filter(c => categories[c.key]?.length).map(({ key, emoji }) => (
              <div key={key}>
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2 px-1">
                  <span className="text-lg grayscale">{emoji}</span> {key}
                </h3>
                <div className="space-y-3">
                  {categories[key].map((item) => {
                    const checkId = `${item.recipe_id}-${item.raw}`;
                    const isChecked = checked[checkId];
                    return (
                      <div
                        key={checkId}
                        onClick={() => toggleCheck(checkId)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-[0.98] ${isChecked ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-white border-[#006d5b]/10 shadow-sm'}`}
                      >
                        <div className="shrink-0">
                          {isChecked
                            ? <CheckCircle2 className="text-[#006d5b]" size={22} />
                            : <Circle className="text-gray-200" size={22} />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${isChecked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {item.text}
                          </p>
                          <p className="text-[10px] text-gray-400 font-medium italic truncate">{item.recipe}</p>
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
      
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-max px-6 py-3 bg-white/90 backdrop-blur-md border border-gray-100 rounded-full shadow-xl flex items-center gap-3">
        <span className="text-xs font-bold text-gray-500">Cochés : {Object.values(checked).filter(Boolean).length} / {Object.values(categories).flat().length}</span>
      </div>
    </div>
  );
};
