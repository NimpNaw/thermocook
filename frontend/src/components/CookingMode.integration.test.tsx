// Test d'intégration SANS mock de useRecipeQuery : vérifie le contrat central
// du Mode Cuisine — la recette déjà chargée par la fiche détail (même clé
// recipeKeys.detail) est servie depuis le cache TanStack Query, sans aucun
// appel réseau. C'est ce qui garantit le démarrage instantané et le
// fonctionnement hors-ligne. Si la clé de cache divergeait un jour de celle
// de RecipeDetailPage, ce test casserait.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookingMode } from './CookingMode';
import { recipeKeys } from '../hooks/queries/useRecipeQueries';
import type { Recipe } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getRecipe: vi.fn().mockRejectedValue(new Error('hors-ligne (simulation)')),
    },
  };
});

import { api } from '../api';

const recipe: Recipe = {
  id: 'r1',
  title: 'Tarte aux pommes',
  slug: 'tarte-aux-pommes',
  folder_name: 'cmix_cookomix/tarte-aux-pommes',
  steps_json: [{ text: 'Préchauffer le four à 180°C.' }],
};

it('sert la recette depuis le cache TQ rempli par la fiche détail, sans appel réseau', () => {
  // Mêmes défauts que main.tsx : staleTime 5 min → une donnée fraîche en cache
  // ne déclenche pas de refetch au montage.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  queryClient.setQueryData(recipeKeys.detail('r1'), recipe);

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/r1/cooking']}>
        <Routes>
          <Route path="/recipes/:id/cooking" element={<CookingMode />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  // Affichage synchrone : la recette vient du cache, pas d'état de chargement
  expect(screen.getByText('Tarte aux pommes')).toBeInTheDocument();
  expect(screen.getByText('Préchauffer le four à 180°C.')).toBeInTheDocument();
  expect(api.getRecipe).not.toHaveBeenCalled();
});
