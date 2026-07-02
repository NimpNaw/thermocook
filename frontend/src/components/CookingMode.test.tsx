// Reproduit le bug : CookingMode faisait un fetch brut sans .catch() ;
// en cas d'échec réseau (offline, 5xx), le composant retournait `null`
// indéfiniment → overlay blanc plein écran sans message ni sortie.
// Comportement attendu : utiliser useRecipeQuery (cache TanStack Query,
// résilience offline) et afficher un état d'erreur avec un bouton de retour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookingMode } from './CookingMode';
import type { Recipe } from '../api';

vi.mock('../hooks/queries/useRecipeQueries', async () => {
  const actual = await vi.importActual<typeof import('../hooks/queries/useRecipeQueries')>(
    '../hooks/queries/useRecipeQueries'
  );
  return {
    ...actual,
    useRecipeQuery: vi.fn(),
  };
});

// Sécurité : le composant ne doit plus appeler api.getRecipe directement.
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getRecipe: vi.fn().mockRejectedValue(new Error('appel direct interdit')),
    },
  };
});

import { useRecipeQuery } from '../hooks/queries/useRecipeQueries';
import { api } from '../api';

const recipe: Recipe = {
  id: 'r1',
  title: 'Tarte aux pommes',
  slug: 'tarte-aux-pommes',
  folder_name: 'cmix_cookomix/tarte-aux-pommes',
  steps_json: [{ text: 'Préchauffer le four à 180°C.' }],
};

function renderCookingMode() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/r1/cooking']}>
        <Routes>
          <Route path="/recipes/:id/cooking" element={<CookingMode />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CookingMode — chargement de la recette', () => {
  beforeEach(() => {
    vi.mocked(useRecipeQuery).mockReset();
  });

  it('affiche la recette et la première étape via useRecipeQuery (cache TQ)', () => {
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: recipe,
      isLoading: false,
      isError: false,
    } as any);

    renderCookingMode();

    expect(screen.getByText('Tarte aux pommes')).toBeInTheDocument();
    expect(screen.getByText('Préchauffer le four à 180°C.')).toBeInTheDocument();
    expect(api.getRecipe).not.toHaveBeenCalled();
  });

  it("affiche un message d'erreur avec boutons Réessayer et Retour si le chargement échoue", () => {
    const refetch = vi.fn();
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as any);

    renderCookingMode();

    expect(screen.getByText(/impossible de charger la recette/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retour/i })).toBeInTheDocument();

    screen.getByRole('button', { name: /réessayer/i }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("n'affiche pas d'écran blanc pendant le chargement (indicateur accessible)", () => {
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    renderCookingMode();

    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
  });
});
