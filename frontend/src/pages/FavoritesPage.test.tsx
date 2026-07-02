import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FavoritesPage } from './FavoritesPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../hooks/queries/useRecipeQueries', () => ({
  useFavoritesQuery: vi.fn(),
}));

import { useFavoritesQuery } from '../hooks/queries/useRecipeQueries';

const recipes = [
  { id: 'r1', title: 'Tarte aux pommes', slug: 'tarte-aux-pommes' },
  { id: 'r2', title: 'Soupe de potiron', slug: 'soupe-de-potiron' },
];

describe('FavoritesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche un indicateur pendant le chargement', () => {
    vi.mocked(useFavoritesQuery).mockReturnValue({ data: undefined, isLoading: true } as any);
    render(<FavoritesPage favorites={[]} />);
    expect(screen.getByText('Récupération de vos coups de cœur...')).toBeInTheDocument();
  });

  it('affiche un état vide sans favoris', () => {
    vi.mocked(useFavoritesQuery).mockReturnValue({ data: [], isLoading: false } as any);
    render(<FavoritesPage favorites={[]} />);
    expect(screen.getByText('Mes Favoris')).toBeInTheDocument();
    expect(screen.getByText("Vous n'avez pas encore de recettes favorites.")).toBeInTheDocument();
  });

  it('affiche les recettes favorites', () => {
    vi.mocked(useFavoritesQuery).mockReturnValue({ data: recipes, isLoading: false } as any);
    render(<FavoritesPage favorites={['r1', 'r2']} />);
    expect(screen.getByText('Tarte aux pommes')).toBeInTheDocument();
    expect(screen.getByText('Soupe de potiron')).toBeInTheDocument();
    expect(screen.queryByText("Vous n'avez pas encore de recettes favorites.")).toBeNull();
  });

  it('propage toggleFavorite au clic sur le cœur d\'une carte', () => {
    const toggleFavorite = vi.fn();
    const isFavorite = (id: string) => id === 'r1';
    vi.mocked(useFavoritesQuery).mockReturnValue({ data: recipes, isLoading: false } as any);
    render(
      <FavoritesPage favorites={['r1']} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />
    );

    // Chaque carte a un bouton cœur (seul bouton de la carte).
    const card = screen.getByText('Tarte aux pommes').closest('.bg-white')!;
    fireEvent.click(card.querySelector('button')!);

    expect(toggleFavorite).toHaveBeenCalledWith('r1');
  });
});
