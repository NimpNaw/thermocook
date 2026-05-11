// frontend/src/pages/RecipeDetailPage.test.tsx
// Garde-fou : tous les blocs d'information visibles sur la fiche détail
// doivent rester présents. Sans ce test, un champ peut disparaître
// silencieusement (cf. cas `portions` perdu côté API).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../context/ToastContext';
import { RecipeDetailPage } from './RecipeDetailPage';
import type { Recipe } from '../api';

vi.mock('../hooks/queries/useRecipeQueries', async () => {
  const actual = await vi.importActual<typeof import('../hooks/queries/useRecipeQueries')>(
    '../hooks/queries/useRecipeQueries'
  );
  return {
    ...actual,
    useRecipeQuery: vi.fn(),
    useAddToShoppingListMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn(), refreshUser: vi.fn() }),
}));

import { useRecipeQuery } from '../hooks/queries/useRecipeQueries';

const fullRecipe: Recipe = {
  id: 'r1',
  title: 'Tarte aux pommes',
  slug: 'tarte-aux-pommes',
  folder_name: 'tarte-aux-pommes_r1',
  difficulty: 'Facile',
  total_time: 2700, // 45 min
  portions: '6 portions',
  category: 'Dessert',
  image_main: 'images/principale.jpg',
  ingredients_json: [
    { raw: '300g farine' },
    { raw: '150g sucre' },
  ],
  steps_json: [
    { text: 'Mélanger la farine et le sucre.' },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider showToast={() => {}}>
        <MemoryRouter initialEntries={['/recipes/r1']}>
          <Routes>
            <Route path="/recipes/:id" element={<RecipeDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('RecipeDetailPage — affichage des éléments de la recette', () => {
  beforeEach(() => {
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: fullRecipe,
      isLoading: false,
      error: null,
    } as any);
  });

  it('affiche le titre', () => {
    renderPage();
    expect(screen.getByText('Tarte aux pommes')).toBeInTheDocument();
  });

  it('affiche la difficulté', () => {
    renderPage();
    expect(screen.getByText('Facile')).toBeInTheDocument();
  });

  it('affiche le temps de préparation formaté', () => {
    renderPage();
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('affiche les portions', () => {
    renderPage();
    expect(screen.getByText('6 portions')).toBeInTheDocument();
  });

  it('affiche la catégorie', () => {
    renderPage();
    expect(screen.getByText('Dessert')).toBeInTheDocument();
  });

  it('affiche les ingrédients', () => {
    renderPage();
    expect(screen.getByText(/300g farine/)).toBeInTheDocument();
    expect(screen.getByText(/150g sucre/)).toBeInTheDocument();
  });

  it('affiche les étapes de préparation', () => {
    renderPage();
    expect(screen.getByText(/Mélanger la farine et le sucre\./)).toBeInTheDocument();
  });

  it("affiche '--' à la place des portions quand le champ est absent", () => {
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: { ...fullRecipe, portions: undefined },
      isLoading: false,
      error: null,
    } as any);
    renderPage();
    // Préparation reste '45 min', Difficulté 'Facile', Catégorie 'Dessert' → seule Portions tombe sur '--'
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
