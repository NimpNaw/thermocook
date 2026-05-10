// frontend/src/components/RecipeCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeCard } from './RecipeCard';
import { ErrorMessage } from './ErrorMessage';
import type { Recipe } from '../api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../store/useSearchStore', () => ({
  useSearchStore: () => ({ searchQuery: '' }),
}));

// Type Recipe : { id, title, slug, folder_name?, difficulty?, total_time?, portions?, image_main?, ... }
const baseRecipe: Recipe = {
  id: '42',
  title: 'Tarte aux pommes',
  slug: 'tarte-aux-pommes',
  folder_name: 'tarte-aux-pommes_42',
  image_main: 'main.jpg',
  difficulty: 'Facile',
  total_time: 2700,
  portions: '6 personnes',
};

describe('RecipeCard', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('affiche le titre de la recette', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    expect(screen.getByText('Tarte aux pommes')).toBeInTheDocument();
  });

  it('affiche le temps formaté', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('affiche les portions', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    expect(screen.getByText('6 personnes')).toBeInTheDocument();
  });

  it('affiche "--" si total_time est absent', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, total_time: undefined }} isFav={false} onToggleFav={() => {}} />);
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
  });

  it('navigue vers la page recette au clic sur la carte', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    fireEvent.click(screen.getByText('Tarte aux pommes'));
    expect(mockNavigate).toHaveBeenCalledWith('/recipes/42', { state: { from: 'internal' } });
  });

  it('appelle onToggleFav avec l\'id au clic sur le bouton favori', () => {
    const onToggleFav = vi.fn();
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={onToggleFav} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggleFav).toHaveBeenCalledWith('42');
  });

  it('ne navigue pas quand on clique sur le bouton favori', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('affiche l\'icône ChefHat si pas d\'image', () => {
    const { container } = render(
      <RecipeCard recipe={{ ...baseRecipe, image_main: undefined }} isFav={false} onToggleFav={() => {}} />
    );
    // Sans image : pas de balise img, et au moins 2 SVGs (Heart + ChefHat)
    // Avec image il y aurait un <img> et un seul SVG (le Heart du bouton favori)
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('affiche l\'image via RecipeImage avec l\'URL thumbs', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/thumbs/tarte-aux-pommes_42/main.jpg?size=thumb');
  });

  it('n\'affiche pas le bouton favori si onToggleFav est absent (non connecté)', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('affiche le bouton favori actif (orange) quand isFav est true', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={true} onToggleFav={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-orange-500');
    expect(btn.className).not.toContain('bg-white');
  });

  it('affiche le bouton favori inactif (gris) quand isFav est false', () => {
    render(<RecipeCard recipe={baseRecipe} isFav={false} onToggleFav={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-white/80');
    expect(btn.className).not.toContain('bg-orange-500');
  });
});

describe('ErrorMessage', () => {
  it('affiche le message d\'erreur', () => {
    render(<ErrorMessage message="Recette introuvable" />);
    expect(screen.getByText('Recette introuvable')).toBeInTheDocument();
    expect(screen.getByText('Oups ! Une erreur est survenue')).toBeInTheDocument();
  });
});
