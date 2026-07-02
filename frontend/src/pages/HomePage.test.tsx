import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomePage } from './HomePage';
import type { User } from '../api';
import { CATEGORIES } from '../constants/categories';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../hooks/queries/useRecipeQueries', () => ({
  useRecipesSeasonalQuery: vi.fn(),
  useRecipesRandomQuery: vi.fn(),
  useAdminAlertsQuery: vi.fn(),
}));

import {
  useRecipesSeasonalQuery,
  useRecipesRandomQuery,
  useAdminAlertsQuery,
} from '../hooks/queries/useRecipeQueries';

const adminUser: User = {
  id: 1,
  username: 'admin',
  is_active: true,
  is_admin: true,
  created_at: '2024-01-01T00:00:00',
};

const recipe = (id: string, title: string) => ({ id, title, slug: title.toLowerCase() });

function mockQueries({
  seasonal = [] as ReturnType<typeof recipe>[],
  random = [] as ReturnType<typeof recipe>[],
  loadingSeasonal = false,
  loadingRandom = false,
  alerts = undefined as { unresolved_errors: number } | undefined,
  refetchRandom = vi.fn(),
  isRefetchingRandom = false,
} = {}) {
  vi.mocked(useRecipesSeasonalQuery).mockReturnValue({
    data: seasonal,
    isLoading: loadingSeasonal,
  } as any);
  vi.mocked(useRecipesRandomQuery).mockReturnValue({
    data: random,
    isLoading: loadingRandom,
    refetch: refetchRandom,
    isFetching: isRefetchingRandom,
  } as any);
  vi.mocked(useAdminAlertsQuery).mockReturnValue({ data: alerts } as any);
  return { refetchRandom };
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les sections Saison, Parcourir et À découvrir', () => {
    mockQueries();
    render(<HomePage />);
    expect(screen.getByText("C'est la saison !")).toBeInTheDocument();
    expect(screen.getByText('Parcourir')).toBeInTheDocument();
    expect(screen.getByText('À découvrir')).toBeInTheDocument();
  });

  it('affiche les recettes de saison', () => {
    mockQueries({ seasonal: [recipe('s1', 'Soupe de potiron')] });
    render(<HomePage />);
    expect(screen.getByText('Soupe de potiron')).toBeInTheDocument();
  });

  it('affiche un message si aucune recette de saison', () => {
    mockQueries({ seasonal: [] });
    render(<HomePage />);
    expect(screen.getByText('Aucune recette de saison trouvée pour ce mois.')).toBeInTheDocument();
  });

  it('affiche les suggestions aléatoires', () => {
    mockQueries({ random: [recipe('a1', 'Gratin dauphinois')] });
    render(<HomePage />);
    expect(screen.getByText('Gratin dauphinois')).toBeInTheDocument();
  });

  it('affiche toutes les catégories du référentiel', () => {
    mockQueries();
    render(<HomePage />);
    CATEGORIES.forEach((cat) => {
      expect(screen.getByText(cat.label)).toBeInTheDocument();
    });
  });

  it('navigue vers le catalogue filtré au clic sur une catégorie', () => {
    mockQueries();
    render(<HomePage />);
    fireEvent.click(screen.getByText('Plat principal'));
    expect(mockNavigate).toHaveBeenCalledWith('/recipes?category=Plat%20principal');
  });

  it('relance les suggestions au clic sur le bouton rafraîchir', () => {
    const { refetchRandom } = mockQueries({ random: [recipe('a1', 'Gratin')] });
    render(<HomePage />);
    // Le bouton rafraîchir est le seul bouton de la section "À découvrir".
    const refreshButton = screen.getByText('À découvrir').closest('section')!.querySelector('button')!;
    fireEvent.click(refreshButton);
    expect(refetchRandom).toHaveBeenCalledOnce();
  });

  describe('bandeau d\'alerte admin', () => {
    it('affiche le bandeau si admin avec erreurs non résolues', () => {
      mockQueries({ alerts: { unresolved_errors: 2 } });
      render(<HomePage currentUser={adminUser} />);
      expect(
        screen.getByText("2 erreurs d'import non résolues — voir l'administration")
      ).toBeInTheDocument();
    });

    it('accorde le singulier pour une seule erreur', () => {
      mockQueries({ alerts: { unresolved_errors: 1 } });
      render(<HomePage currentUser={adminUser} />);
      expect(
        screen.getByText("1 erreur d'import non résolue — voir l'administration")
      ).toBeInTheDocument();
    });

    it('navigue vers /admin au clic sur le bandeau', () => {
      mockQueries({ alerts: { unresolved_errors: 2 } });
      render(<HomePage currentUser={adminUser} />);
      fireEvent.click(screen.getByText("2 erreurs d'import non résolues — voir l'administration"));
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });

    it('masque le bandeau sans erreur non résolue', () => {
      mockQueries({ alerts: { unresolved_errors: 0 } });
      render(<HomePage currentUser={adminUser} />);
      expect(screen.queryByText(/erreur.*d'import/)).toBeNull();
    });

    it('masque le bandeau pour un utilisateur non admin', () => {
      mockQueries({ alerts: { unresolved_errors: 2 } });
      render(<HomePage currentUser={{ ...adminUser, is_admin: false }} />);
      expect(screen.queryByText(/erreurs d'import/)).toBeNull();
    });

    it('demande les alertes seulement pour un admin', () => {
      mockQueries();
      render(<HomePage currentUser={adminUser} />);
      expect(useAdminAlertsQuery).toHaveBeenCalledWith(true);
    });

    it('ne demande pas les alertes sans utilisateur', () => {
      mockQueries();
      render(<HomePage currentUser={null} />);
      expect(useAdminAlertsQuery).toHaveBeenCalledWith(false);
    });
  });
});
