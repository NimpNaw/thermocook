import React, { useEffect, useCallback } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

// Components
import { RecipeCard } from './components/RecipeCard';
import { CookingMode } from './components/CookingMode';
import { ToastContainer } from './components/ToastContainer';
import { MainLayout } from './components/layout/MainLayout';

// Hooks & Stores
import { useQueryClient } from '@tanstack/react-query';
import { useFavorites } from './hooks/useFavorites';
import type { Recipe } from './api';
import { useAuth } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { ToastProvider } from './context/ToastContext';
import { useSearchRecipesInfiniteQuery } from './hooks/queries/useRecipeQueries';
import { useSearchStore } from './store/useSearchStore';
import { useIntersectionObserver } from './hooks/useIntersectionObserver';
import { useDebounce } from './hooks/useDebounce';
import { useScrollRestoration } from './hooks/useScrollRestoration';

// Pages
import { HomePage } from './pages/HomePage';
import { RecipesPage } from './pages/RecipesPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { LoginPage } from './pages/LoginPage';
import { ShoppingListPage } from './pages/ShoppingListPage';
import { SharedListPage } from './pages/SharedListPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

const SearchResultsOverlay: React.FC<{
  query: string;
  isFavorite?: (id: string) => boolean;
  toggleFavorite?: (id: string) => void;
  onClear: () => void;
}> = ({ query, isFavorite, toggleFavorite, onClear }) => {
  useScrollRestoration('search');
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSearchRecipesInfiniteQuery(query, 40);

  const searchResults = data?.pages.flat() || [];
  const { sentinelRef } = useIntersectionObserver({
    onIntersect: fetchNextPage,
    enabled: hasNextPage && !isFetchingNextPage,
  });

  if (query.trim().length <= 2) return null;

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Résultats pour "{query}"</h2>
        <button onClick={onClear} className="text-sm text-gray-500">Effacer</button>
      </div>

      {!isLoading && searchResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500 text-lg font-medium">Désolé, aucune recette ne correspond.</p>
          <p className="text-gray-400 text-sm mt-2">Essayez d'autres mots-clés.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {searchResults.map(r => (
            <RecipeCard key={r.id} recipe={r} isFav={isFavorite?.(r.id)} onToggleFav={toggleFavorite} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-20 flex items-center justify-center">
        {(isLoading || isFetchingNextPage) && (
          <div className="flex items-center gap-2 text-[#006d5b] animate-pulse">
            <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            <span className="text-sm font-medium ml-2">Recherche en cours...</span>
          </div>
        )}
        {!hasNextPage && searchResults.length > 0 && (
          <p className="text-gray-400 text-sm italic">Fin des résultats</p>
        )}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { favorites, isFavorite, toggleFavorite: _toggleFavorite, syncToServer } = useFavorites();

  const handleCacheInvalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['recipes', 'list'] });
  }, [queryClient]);

  const toggleFavorite = useCallback((id: string) => {
    const added = _toggleFavorite(id);
    if (!added) {
      // Suppression : mise à jour optimiste du cache TQ pour affichage immédiat
      queryClient.setQueryData<Recipe[]>(
        ['recipes', 'favorites'],
        (old) => old?.filter(r => r.id !== id) ?? []
      );
    } else {
      // Ajout : invalider le cache pour déclencher un refetch au prochain montage
      queryClient.invalidateQueries({ queryKey: ['recipes', 'favorites'] });
    }
  }, [_toggleFavorite, queryClient]);
  const { user, loading: authLoading, refreshUser, logout } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const { searchQuery, clearSearch } = useSearchStore();
  const debouncedQuery = useDebounce(searchQuery, 300);
  const isRecipeDetail = /^\/recipes\/[^/]+$/.test(location.pathname);
  const isCookingMode = /^\/recipes\/.+\/cooking$/.test(location.pathname);
  const isOverlay = isRecipeDetail || isCookingMode;

  const listPathRef = React.useRef(location.pathname);
  if (!isOverlay) listPathRef.current = location.pathname;

  useEffect(() => {
    if (user) {
      syncToServer();
    }
  }, [user, syncToServer]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <ToastProvider showToast={showToast}>
      <MainLayout onSearch={handleSearchSubmit} user={user}>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        
        {(() => {
          if (!isOverlay && debouncedQuery.trim().length > 2) {
            return (
              <SearchResultsOverlay
                query={debouncedQuery}
                isFavorite={user ? isFavorite : undefined}
                toggleFavorite={user ? toggleFavorite : undefined}
                onClear={clearSearch}
              />
            );
          }
          const p = listPathRef.current;
          if (p === '/') return <HomePage isFavorite={user ? isFavorite : undefined} toggleFavorite={user ? toggleFavorite : undefined} currentUser={user} />;
          if (p === '/recipes') return <RecipesPage isFavorite={user ? isFavorite : undefined} toggleFavorite={user ? toggleFavorite : undefined} isActive={!isOverlay} />;
          if (p === '/favorites') return <FavoritesPage favorites={favorites} isFavorite={user ? isFavorite : undefined} toggleFavorite={user ? toggleFavorite : undefined} />;
          if (p === '/login') return <LoginPage onLoginSuccess={refreshUser} />;
          if (p === '/shopping-list') return <ShoppingListPage />;
          if (p.startsWith('/shared/')) {
            // SharedListPage utilise `useParams` pour lire `:token` ; il faut donc
            // le rendre via une `<Route>` (sans Routes parent ici, useParams retourne {}).
            return (
              <Routes>
                <Route path="/shared/:token" element={<SharedListPage />} />
              </Routes>
            );
          }
          if (p === '/profile') return <ProfilePage user={user} favoritesCount={favorites.length} onLogout={logout} />;
          if (p === '/admin') return <AdminPage currentUser={user} authLoading={authLoading} onCacheInvalidate={handleCacheInvalidate} />;
          return null;
        })()}

        {isOverlay && (
          <div className="fixed inset-0 z-40 overflow-y-auto bg-white">
            <Routes>
              <Route path="/recipes/:id" element={<RecipeDetailPage isFav={user ? isFavorite : undefined} onToggleFav={user ? toggleFavorite : undefined} />} />
              <Route path="/recipes/:id/cooking" element={<CookingMode />} />
            </Routes>
          </div>
        )}
      </MainLayout>
    </ToastProvider>
  );
};

export default App;
