// Tests des hooks de requêtes recettes (TanStack Query).
//
// 1. Reproduit le bug d'invalidation admin : App.tsx n'invalidait que
//    ['recipes', 'list'], laissant les sections Accueil (seasonal/random),
//    Favoris et fiches détail afficher des recettes supprimées après un
//    import/sync/purge. L'invalidation doit couvrir TOUTES les requêtes
//    recettes, sans toucher aux requêtes étrangères (liste de courses).
// 2. Verrouille la factory `recipeKeys` (les clés générées doivent rester
//    strictement identiques aux anciennes clés construites à la main).
// 3. Couvre chaque hook : clé de cache, appel API, pagination
//    (getNextPageParam), `enabled`, et invalidation après mutation.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  invalidateAllRecipeQueries,
  recipeKeys,
  useRecipesInfiniteQuery,
  useSearchRecipesInfiniteQuery,
  useRecipeQuery,
  useShoppingListQuery,
  useFavoritesQuery,
  useAddToShoppingListMutation,
  useRemoveRecipeFromShoppingListMutation,
  useExcludeIngredientFromShoppingListMutation,
  useRecipesSeasonalQuery,
  useRecipesRandomQuery,
  useAdminAlertsQuery,
} from './useRecipeQueries';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getRecipes: vi.fn(),
    searchRecipes: vi.fn(),
    getRecipe: vi.fn(),
    getShoppingList: vi.fn(),
    getFavorites: vi.fn(),
    addToShoppingList: vi.fn(),
    removeRecipeFromShoppingList: vi.fn(),
    excludeIngredientFromShoppingList: vi.fn(),
    getRecipesSeasonal: vi.fn(),
    getRecipesRandom: vi.fn(),
    getAlerts: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const recipe = (id: string) => ({ id, title: `Recette ${id}`, slug: `recette-${id}` });

beforeEach(() => {
  vi.clearAllMocks();
});

// ── recipeKeys ───────────────────────────────────────────────────────────────

describe('recipeKeys', () => {
  it('génère les clés de liste et de détail', () => {
    expect(recipeKeys.all).toEqual(['recipes']);
    expect(recipeKeys.lists()).toEqual(['recipes', 'list']);
    expect(recipeKeys.list({ category: 'Dessert', sort: 'random', limit: 40 })).toEqual([
      'recipes',
      'list',
      { category: 'Dessert', sort: 'random', limit: 40 },
    ]);
    expect(recipeKeys.details()).toEqual(['recipes', 'detail']);
    expect(recipeKeys.detail('r1')).toEqual(['recipes', 'detail', 'r1']);
  });

  it('seasonal/random/favorites produisent les mêmes clés que les anciennes clés manuelles', () => {
    // Comportement strictement identique à l'ancien code en dur :
    // [...recipeKeys.all, 'seasonal', limit], etc.
    expect(recipeKeys.seasonal(6)).toEqual(['recipes', 'seasonal', 6]);
    expect(recipeKeys.random(12)).toEqual(['recipes', 'random', 12]);
    expect(recipeKeys.favorites()).toEqual(['recipes', 'favorites']);
  });

  it('shoppingList reste hors du préfixe recettes', () => {
    expect(recipeKeys.shoppingList()).toEqual(['shopping-list']);
  });
});

// ── invalidateAllRecipeQueries ───────────────────────────────────────────────

describe('invalidateAllRecipeQueries', () => {
  it('invalide list, seasonal, random, favorites et detail', () => {
    const queryClient = new QueryClient();
    const recipeQueryKeys = [
      recipeKeys.list({ category: undefined, sort: 'random', limit: 40 }),
      recipeKeys.seasonal(6),
      recipeKeys.random(6),
      recipeKeys.favorites(),
      recipeKeys.detail('r1'),
    ];
    recipeQueryKeys.forEach((key) => queryClient.setQueryData(key, []));

    invalidateAllRecipeQueries(queryClient);

    recipeQueryKeys.forEach((key) => {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    });
  });

  it('ne touche pas aux requêtes étrangères (liste de courses, admin)', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(recipeKeys.shoppingList(), []);
    queryClient.setQueryData(['admin', 'alerts'], []);

    invalidateAllRecipeQueries(queryClient);

    expect(queryClient.getQueryState(recipeKeys.shoppingList())?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(['admin', 'alerts'])?.isInvalidated).toBe(false);
  });
});

// ── useRecipesInfiniteQuery ──────────────────────────────────────────────────

describe('useRecipesInfiniteQuery', () => {
  it('charge la première page avec offset 0 et la met en cache sous la bonne clé', async () => {
    mockedApi.getRecipes.mockResolvedValue([recipe('r1')]);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipesInfiniteQuery('Dessert', 'title', 2), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.getRecipes).toHaveBeenCalledWith(0, 2, 'Dessert', 'title');
    expect(
      queryClient.getQueryData(recipeKeys.list({ category: 'Dessert', sort: 'title', limit: 2 }))
    ).toBeDefined();
  });

  it('page pleine : hasNextPage=true et fetchNextPage demande l\'offset suivant', async () => {
    mockedApi.getRecipes
      .mockResolvedValueOnce([recipe('r1'), recipe('r2')]) // page pleine (limit=2)
      .mockResolvedValueOnce([recipe('r3')]); // page incomplète
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipesInfiniteQuery(undefined, 'random', 2), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mockedApi.getRecipes).toHaveBeenLastCalledWith(2, 2, undefined, 'random');
    // La deuxième page est incomplète : plus de page suivante.
    expect(result.current.hasNextPage).toBe(false);
  });

  it('page incomplète dès la première page : hasNextPage=false', async () => {
    mockedApi.getRecipes.mockResolvedValue([recipe('r1')]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipesInfiniteQuery(undefined, 'random', 40), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('enabled=false : aucun appel API', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useRecipesInfiniteQuery(undefined, 'random', 40, false),
      { wrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.getRecipes).not.toHaveBeenCalled();
  });
});

// ── useSearchRecipesInfiniteQuery ────────────────────────────────────────────

describe('useSearchRecipesInfiniteQuery', () => {
  it('désactivé tant que la requête fait 2 caractères ou moins', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearchRecipesInfiniteQuery('ab'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.searchRecipes).not.toHaveBeenCalled();
  });

  it('recherche dès 3 caractères et met en cache sous la clé {query, limit}', async () => {
    mockedApi.searchRecipes.mockResolvedValue([recipe('r1')]);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useSearchRecipesInfiniteQuery('taboulé', 40), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.searchRecipes).toHaveBeenCalledWith('taboulé', 0, 40);
    expect(queryClient.getQueryData(recipeKeys.list({ query: 'taboulé', limit: 40 }))).toBeDefined();
  });

  it('page pleine : fetchNextPage recherche avec l\'offset suivant', async () => {
    mockedApi.searchRecipes
      .mockResolvedValueOnce([recipe('r1'), recipe('r2')])
      .mockResolvedValueOnce([]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearchRecipesInfiniteQuery('tarte', 2), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    result.current.fetchNextPage();

    await waitFor(() => expect(mockedApi.searchRecipes).toHaveBeenLastCalledWith('tarte', 2, 2));
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  });
});

// ── useRecipeQuery ───────────────────────────────────────────────────────────

describe('useRecipeQuery', () => {
  it('charge la recette et la met en cache sous recipeKeys.detail(id)', async () => {
    mockedApi.getRecipe.mockResolvedValue(recipe('r1'));
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipeQuery('r1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.getRecipe).toHaveBeenCalledWith('r1');
    expect(queryClient.getQueryData(recipeKeys.detail('r1'))).toEqual(recipe('r1'));
  });

  it('désactivé sans id : aucun appel API', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipeQuery(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.getRecipe).not.toHaveBeenCalled();
  });
});

// ── useShoppingListQuery / useFavoritesQuery ─────────────────────────────────

describe('useShoppingListQuery', () => {
  it('charge la liste de courses sous recipeKeys.shoppingList()', async () => {
    const list = { categories: {}, recipes: [] };
    mockedApi.getShoppingList.mockResolvedValue(list);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useShoppingListQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(recipeKeys.shoppingList())).toEqual(list);
  });
});

describe('useFavoritesQuery', () => {
  it('charge les favoris sous recipeKeys.favorites()', async () => {
    mockedApi.getFavorites.mockResolvedValue([recipe('r1')]);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useFavoritesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.getFavorites).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(recipeKeys.favorites())).toEqual([recipe('r1')]);
  });
});

// ── Mutations liste de courses ───────────────────────────────────────────────

describe('mutations liste de courses', () => {
  it('useAddToShoppingListMutation invalide la liste de courses après succès', async () => {
    mockedApi.addToShoppingList.mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(recipeKeys.shoppingList(), { categories: {}, recipes: [] });
    queryClient.setQueryData(recipeKeys.detail('r1'), recipe('r1'));

    const { result } = renderHook(() => useAddToShoppingListMutation(), { wrapper });
    await result.current.mutateAsync('r1');

    expect(mockedApi.addToShoppingList).toHaveBeenCalledWith('r1');
    expect(queryClient.getQueryState(recipeKeys.shoppingList())?.isInvalidated).toBe(true);
    // Les requêtes recettes ne sont pas concernées.
    expect(queryClient.getQueryState(recipeKeys.detail('r1'))?.isInvalidated).toBe(false);
  });

  it('useRemoveRecipeFromShoppingListMutation invalide la liste de courses après succès', async () => {
    mockedApi.removeRecipeFromShoppingList.mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(recipeKeys.shoppingList(), { categories: {}, recipes: [] });

    const { result } = renderHook(() => useRemoveRecipeFromShoppingListMutation(), { wrapper });
    await result.current.mutateAsync('r1');

    expect(mockedApi.removeRecipeFromShoppingList).toHaveBeenCalledWith('r1');
    expect(queryClient.getQueryState(recipeKeys.shoppingList())?.isInvalidated).toBe(true);
  });

  it('useExcludeIngredientFromShoppingListMutation transmet recipeId/raw et invalide la liste', async () => {
    mockedApi.excludeIngredientFromShoppingList.mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(recipeKeys.shoppingList(), { categories: {}, recipes: [] });

    const { result } = renderHook(() => useExcludeIngredientFromShoppingListMutation(), { wrapper });
    await result.current.mutateAsync({ recipeId: 'r1', raw: '100g farine' });

    expect(mockedApi.excludeIngredientFromShoppingList).toHaveBeenCalledWith('r1', '100g farine');
    expect(queryClient.getQueryState(recipeKeys.shoppingList())?.isInvalidated).toBe(true);
  });

  it('pas d\'invalidation si la mutation échoue', async () => {
    mockedApi.addToShoppingList.mockRejectedValue(new Error('boom'));
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(recipeKeys.shoppingList(), { categories: {}, recipes: [] });

    const { result } = renderHook(() => useAddToShoppingListMutation(), { wrapper });
    await expect(result.current.mutateAsync('r1')).rejects.toThrow('boom');

    expect(queryClient.getQueryState(recipeKeys.shoppingList())?.isInvalidated).toBe(false);
  });
});

// ── useRecipesSeasonalQuery / useRecipesRandomQuery ──────────────────────────

describe('useRecipesSeasonalQuery', () => {
  it('charge les recettes de saison sous recipeKeys.seasonal(limit)', async () => {
    mockedApi.getRecipesSeasonal.mockResolvedValue([recipe('r1')]);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipesSeasonalQuery(6), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.getRecipesSeasonal).toHaveBeenCalledWith(6);
    expect(queryClient.getQueryData(recipeKeys.seasonal(6))).toEqual([recipe('r1')]);
  });
});

describe('useRecipesRandomQuery', () => {
  it('charge les suggestions aléatoires sous recipeKeys.random(limit)', async () => {
    mockedApi.getRecipesRandom.mockResolvedValue([recipe('r2')]);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useRecipesRandomQuery(6), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.getRecipesRandom).toHaveBeenCalledWith(6);
    expect(queryClient.getQueryData(recipeKeys.random(6))).toEqual([recipe('r2')]);
  });
});

// ── useAdminAlertsQuery ──────────────────────────────────────────────────────

describe('useAdminAlertsQuery', () => {
  it('désactivé par défaut : aucun appel API', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAdminAlertsQuery(), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.getAlerts).not.toHaveBeenCalled();
  });

  it('activé : charge les alertes sous [admin, alerts]', async () => {
    mockedApi.getAlerts.mockResolvedValue({ unresolved_errors: 3 });
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useAdminAlertsQuery(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['admin', 'alerts'])).toEqual({ unresolved_errors: 3 });
  });
});
