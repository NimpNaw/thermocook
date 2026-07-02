import { useQuery, useMutation, useQueryClient, useInfiniteQuery, QueryClient } from '@tanstack/react-query';
import { api } from '../../api';

export const recipeKeys = {
  all: ['recipes'] as const,
  lists: () => [...recipeKeys.all, 'list'] as const,
  list: (filters: any) => [...recipeKeys.lists(), filters] as const,
  details: () => [...recipeKeys.all, 'detail'] as const,
  detail: (id: string) => [...recipeKeys.details(), id] as const,
  seasonal: (limit: number) => [...recipeKeys.all, 'seasonal', limit] as const,
  random: (limit: number) => [...recipeKeys.all, 'random', limit] as const,
  favorites: () => [...recipeKeys.all, 'favorites'] as const,
  shoppingList: () => ['shopping-list'] as const,
};

/**
 * Invalide TOUTES les requêtes recettes (list, seasonal, random, favorites, detail).
 * À utiliser après un import/sync/purge admin : invalider seulement
 * `recipeKeys.lists()` laisserait les sections Accueil, Favoris et fiches
 * détail afficher des recettes supprimées ou périmées.
 */
export function invalidateAllRecipeQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: recipeKeys.all });
}

export function useRecipesInfiniteQuery(category?: string, sort = 'random', limit = 40, enabled = true) {
  return useInfiniteQuery({
    queryKey: recipeKeys.list({ category, sort, limit }),
    queryFn: ({ pageParam = 0 }) => api.getRecipes(pageParam, limit, category, sort),
    initialPageParam: 0,
    enabled,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === limit ? allPages.length * limit : undefined;
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useSearchRecipesInfiniteQuery(query = '', limit = 40) {
  return useInfiniteQuery({
    queryKey: recipeKeys.list({ query, limit }),
    queryFn: ({ pageParam = 0 }) => api.searchRecipes(query, pageParam, limit),
    initialPageParam: 0,
    enabled: query.length > 2,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === limit ? allPages.length * limit : undefined;
    },
  });
}

export function useRecipeQuery(id: string | undefined) {
  return useQuery({
    queryKey: recipeKeys.detail(id || ''),
    queryFn: () => (id ? api.getRecipe(id) : Promise.reject('No ID provided')),
    enabled: !!id,
  });
}

export function useShoppingListQuery() {
  return useQuery({
    queryKey: recipeKeys.shoppingList(),
    queryFn: () => api.getShoppingList(),
  });
}

export function useFavoritesQuery() {
  return useQuery({
    queryKey: recipeKeys.favorites(),
    queryFn: () => api.getFavorites(),
  });
}

export function useAddToShoppingListMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.addToShoppingList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.shoppingList() });
    },
  });
}

export function useRemoveRecipeFromShoppingListMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeRecipeFromShoppingList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.shoppingList() });
    },
  });
}

export function useExcludeIngredientFromShoppingListMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, raw }: { recipeId: string; raw: string }) => 
      api.excludeIngredientFromShoppingList(recipeId, raw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.shoppingList() });
    },
  });
}

export function useRecipesSeasonalQuery(limit = 6) {
  return useQuery({
    queryKey: recipeKeys.seasonal(limit),
    queryFn: () => api.getRecipesSeasonal(limit),
  });
}

export function useRecipesRandomQuery(limit = 6) {
  return useQuery({
    queryKey: recipeKeys.random(limit),
    queryFn: () => api.getRecipesRandom(limit),
    // staleTime à 0 car on veut souvent rafraîchir les random
    staleTime: 0,
  });
}

export function useAdminAlertsQuery(enabled = false) {
  return useQuery({
    queryKey: ['admin', 'alerts'],
    queryFn: () => api.getAlerts(),
    enabled,
  });
}
