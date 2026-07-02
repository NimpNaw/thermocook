import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';
import { ShoppingListPage } from './ShoppingListPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../api', () => ({
  api: {
    shareShoppingList: vi.fn(),
  },
}));

vi.mock('../hooks/queries/useRecipeQueries', () => ({
  useShoppingListQuery: vi.fn(),
  useRemoveRecipeFromShoppingListMutation: vi.fn(),
  useExcludeIngredientFromShoppingListMutation: vi.fn(),
}));

import { api } from '../api';
import {
  useShoppingListQuery,
  useRemoveRecipeFromShoppingListMutation,
  useExcludeIngredientFromShoppingListMutation,
} from '../hooks/queries/useRecipeQueries';

const shoppingList = {
  categories: {
    'Fruits & Légumes': [
      { text: '2 pommes', recipe: 'Tarte', recipe_id: 'r1', is_direct: false, raw: '2 pommes' },
    ],
    Épicerie: [
      { text: '300g farine', recipe: 'Tarte', recipe_id: 'r1', is_direct: false, raw: '300g farine' },
    ],
  },
  recipes: [{ id: 'r1', title: 'Tarte' }],
};

const removeMutateAsync = vi.fn();
const excludeMutateAsync = vi.fn();

function mockHooks(data: typeof shoppingList | undefined, isLoading = false) {
  vi.mocked(useShoppingListQuery).mockReturnValue({ data, isLoading } as any);
  vi.mocked(useRemoveRecipeFromShoppingListMutation).mockReturnValue({
    mutateAsync: removeMutateAsync,
  } as any);
  vi.mocked(useExcludeIngredientFromShoppingListMutation).mockReturnValue({
    mutateAsync: excludeMutateAsync,
  } as any);
}

function renderPage(showToast = vi.fn()) {
  render(
    <ToastProvider showToast={showToast}>
      <ShoppingListPage />
    </ToastProvider>
  );
  return showToast;
}

// Le bandeau des recettes en haut de page (chips avec bouton X).
function recipesBanner(): HTMLElement {
  return document.querySelector('.min-w-max') as HTMLElement;
}

describe('ShoppingListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche un indicateur pendant le chargement', () => {
    mockHooks(undefined, true);
    renderPage();
    expect(screen.getByText('Préparation de la liste...')).toBeInTheDocument();
  });

  it('affiche un état vide sans ingrédients', () => {
    mockHooks({ categories: {}, recipes: [] });
    renderPage();
    expect(
      screen.getByText('Aucun ingrédient pour le moment. Ajoutez des recettes depuis une fiche recette !')
    ).toBeInTheDocument();
  });

  it('affiche les ingrédients groupés par rayon', () => {
    mockHooks(shoppingList);
    renderPage();
    expect(screen.getByText('Fruits & Légumes')).toBeInTheDocument();
    expect(screen.getByText('Épicerie')).toBeInTheDocument();
    expect(screen.getByText('2 pommes')).toBeInTheDocument();
    expect(screen.getByText('300g farine')).toBeInTheDocument();
  });

  it('affiche le bandeau des recettes de la liste', () => {
    mockHooks(shoppingList);
    renderPage();
    expect(within(recipesBanner()).getByText('Tarte')).toBeInTheDocument();
  });

  it('coche/décoche un ingrédient (rayé quand coché)', () => {
    mockHooks(shoppingList);
    renderPage();
    const item = screen.getByText('2 pommes');
    expect(item.className).not.toContain('line-through');

    fireEvent.click(item.closest('div')!.querySelector('button')!);
    expect(screen.getByText('2 pommes').className).toContain('line-through');
  });

  it('retire une recette entière et affiche un toast', async () => {
    removeMutateAsync.mockResolvedValue(undefined);
    mockHooks(shoppingList);
    const showToast = renderPage();

    fireEvent.click(recipesBanner().querySelector('button')!);

    await waitFor(() => expect(removeMutateAsync).toHaveBeenCalledWith('r1'));
    expect(showToast).toHaveBeenCalledWith('"Tarte" retiré de la liste');
  });

  it('affiche un toast d\'erreur si la suppression de recette échoue', async () => {
    removeMutateAsync.mockRejectedValue(new Error('boom'));
    mockHooks(shoppingList);
    const showToast = renderPage();

    fireEvent.click(recipesBanner().querySelector('button')!);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Impossible de supprimer cette recette.')
    );
  });

  it('retire un ingrédient et affiche un toast', async () => {
    excludeMutateAsync.mockResolvedValue(undefined);
    mockHooks(shoppingList);
    const showToast = renderPage();

    fireEvent.click(screen.getAllByTitle("Retirer l'ingrédient")[0]);

    await waitFor(() =>
      expect(excludeMutateAsync).toHaveBeenCalledWith({ recipeId: 'r1', raw: '2 pommes' })
    );
    expect(showToast).toHaveBeenCalledWith('"2 pommes" retiré');
  });

  it('affiche un toast d\'erreur si le retrait d\'ingrédient échoue', async () => {
    excludeMutateAsync.mockRejectedValue(new Error('boom'));
    mockHooks(shoppingList);
    const showToast = renderPage();

    fireEvent.click(screen.getAllByTitle("Retirer l'ingrédient")[0]);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Impossible de retirer cet ingrédient.')
    );
  });

  it('le bouton retour navigue en arrière', () => {
    mockHooks(shoppingList);
    renderPage();
    // Premier bouton de l'entête = flèche retour.
    fireEvent.click(screen.getByText('Liste de courses').parentElement!.querySelector('button')!);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  describe('partage de la liste', () => {
    it('génère un lien et affiche un toast (fallback sans clipboard)', async () => {
      vi.mocked(api.shareShoppingList).mockResolvedValue({ token: 'tok123', expires_at: '2026-01-01' });
      mockHooks(shoppingList);
      const showToast = renderPage();

      const header = screen.getByText('Liste de courses').parentElement!;
      fireEvent.click(header.querySelectorAll('button')[1]);

      // jsdom : pas de navigator.share ni de clipboard sécurisé → fallback execCommand,
      // lui-même indisponible → toast avec le lien brut.
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('/shared/tok123'))
      );
    });

    it('affiche un toast d\'erreur si la génération du lien échoue', async () => {
      vi.mocked(api.shareShoppingList).mockRejectedValue(new Error('500'));
      mockHooks(shoppingList);
      const showToast = renderPage();

      const header = screen.getByText('Liste de courses').parentElement!;
      fireEvent.click(header.querySelectorAll('button')[1]);

      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith('Erreur lors du partage. Veuillez réessayer.')
      );
    });
  });
});
