import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

// Délais entre les tentatives de sync (ms) : 2s, 5s, 10s
const SYNC_RETRY_DELAYS = [2000, 5000, 10000];

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('thermocook_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  // Référence pour annuler les retries si le composant est démonté
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem('thermocook_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string): boolean => {
    let added = false;
    setFavorites(prev => {
      if (prev.includes(id)) {
        return prev.filter(f => f !== id);
      } else {
        added = true;
        return [...prev, id];
      }
    });
    return added;
  };

  const isFavorite = (id: string) => favorites.includes(id);

  const syncToServer = useCallback(async () => {
    for (let attempt = 0; attempt <= SYNC_RETRY_DELAYS.length; attempt++) {
      try {
        const savedIds = await api.syncFavorites(favorites);
        // Nettoyer le localStorage : supprimer les IDs que le serveur ne connaît pas
        if (savedIds.length !== favorites.length) {
          setFavorites(savedIds);
        }
        return; // succès
      } catch (err) {
        if (attempt < SYNC_RETRY_DELAYS.length && !cancelledRef.current) {
          await new Promise<void>(resolve =>
            setTimeout(resolve, SYNC_RETRY_DELAYS[attempt])
          );
        } else {
          console.error('Échec de la synchronisation des favoris :', err);
          return;
        }
      }
    }
  }, [favorites]);

  return { favorites, toggleFavorite, isFavorite, syncToServer };
};
