import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecipesPage } from './RecipesPage';

vi.mock('../hooks/queries/useRecipeQueries', () => ({
  useRecipesInfiniteQuery: vi.fn(),
}));

import { useRecipesInfiniteQuery } from '../hooks/queries/useRecipeQueries';

const recipe = (id: string, title: string) => ({ id, title, slug: title.toLowerCase() });

function mockQuery({
  pages = [[]] as ReturnType<typeof recipe>[][],
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  fetchNextPage = vi.fn(),
} = {}) {
  vi.mocked(useRecipesInfiniteQuery).mockReturnValue({
    data: isLoading ? undefined : { pages },
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } as any);
}

function renderPage(initialEntry = '/recipes') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RecipesPage />
    </MemoryRouter>
  );
}

describe('RecipesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.IntersectionObserver = vi.fn().mockImplementation(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    }) as unknown as typeof IntersectionObserver;
  });

  it('affiche un indicateur pendant le chargement', () => {
    mockQuery({ isLoading: true });
    renderPage();
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });

  it('affiche les recettes de toutes les pages chargées', () => {
    mockQuery({ pages: [[recipe('r1', 'Tarte')], [recipe('r2', 'Gratin')]] });
    renderPage();
    expect(screen.getByText('Tarte')).toBeInTheDocument();
    expect(screen.getByText('Gratin')).toBeInTheDocument();
  });

  it('affiche "Catalogue complet" sans filtre de catégorie', () => {
    mockQuery();
    renderPage();
    expect(screen.getByText('Catalogue complet')).toBeInTheDocument();
  });

  it('lit la catégorie depuis l\'URL et la passe à la requête', () => {
    mockQuery();
    renderPage('/recipes?category=Dessert');
    expect(screen.getByRole('heading', { name: 'Dessert' })).toBeInTheDocument();
    expect(useRecipesInfiniteQuery).toHaveBeenCalledWith('Dessert', 'random', 40, true);
  });

  it('filtre par catégorie au clic sur une chip', () => {
    mockQuery();
    renderPage();
    fireEvent.click(screen.getByText('Plat principal'));
    expect(useRecipesInfiniteQuery).toHaveBeenLastCalledWith('Plat principal', 'random', 40, true);
  });

  it('retire le filtre au clic sur "Tout"', () => {
    mockQuery();
    renderPage('/recipes?category=Dessert');
    fireEvent.click(screen.getByText('Tout'));
    expect(useRecipesInfiniteQuery).toHaveBeenLastCalledWith(undefined, 'random', 40, true);
  });

  it('re-cliquer la catégorie active la désélectionne', () => {
    mockQuery();
    renderPage('/recipes?category=Dessert');
    // La chip "Dessert" (bouton), pas le titre h2.
    fireEvent.click(screen.getByRole('button', { name: /Dessert/ }));
    expect(useRecipesInfiniteQuery).toHaveBeenLastCalledWith(undefined, 'random', 40, true);
  });

  it('change le tri au clic sur un bouton de tri', () => {
    mockQuery();
    renderPage();
    fireEvent.click(screen.getByTitle('A → Z'));
    expect(useRecipesInfiniteQuery).toHaveBeenLastCalledWith(undefined, 'name_asc', 40, true);
  });

  it('affiche "Fin du catalogue" quand il n\'y a plus de page', () => {
    mockQuery({ pages: [[recipe('r1', 'Tarte')]], hasNextPage: false });
    renderPage();
    expect(screen.getByText('Fin du catalogue')).toBeInTheDocument();
  });

  it('désactive la requête quand isActive=false (overlay recette au-dessus)', () => {
    mockQuery();
    render(
      <MemoryRouter initialEntries={['/recipes']}>
        <RecipesPage isActive={false} />
      </MemoryRouter>
    );
    expect(useRecipesInfiniteQuery).toHaveBeenCalledWith(undefined, 'random', 40, false);
  });
});
