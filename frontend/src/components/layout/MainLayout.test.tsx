import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainLayout } from './MainLayout';
import { useSearchStore } from '../../store/useSearchStore';
import type { User } from '../../api';

const mockNavigate = vi.fn();
const mockLocation = { pathname: '/' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

const fakeUser: User = {
  id: 1,
  username: 'alice',
  is_active: true,
  is_admin: false,
  created_at: '2024-01-01T00:00:00',
};

function renderLayout(pathname: string, user: User | null = fakeUser) {
  mockLocation.pathname = pathname;
  return render(
    <MainLayout onSearch={(e) => e.preventDefault()} user={user}>
      <div data-testid="page-content">Contenu de la page</div>
    </MainLayout>
  );
}

describe('MainLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchStore.setState({ searchQuery: '' });
  });

  it('rend toujours le contenu de la page', () => {
    renderLayout('/');
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  describe('visibilité du Header', () => {
    it('affiche le Header sur la page d\'accueil', () => {
      renderLayout('/');
      expect(screen.getByText('THERMOCOOK')).toBeInTheDocument();
    });

    it('masque le Header sur une fiche recette', () => {
      renderLayout('/recipes/abc-123');
      expect(screen.queryByText('THERMOCOOK')).toBeNull();
    });

    it('masque le Header en mode cuisine', () => {
      renderLayout('/recipes/abc-123/cooking');
      expect(screen.queryByText('THERMOCOOK')).toBeNull();
    });

    it('masque le Header sur /login', () => {
      renderLayout('/login');
      expect(screen.queryByText('THERMOCOOK')).toBeNull();
    });

    it('masque le Header sur /shopping-list', () => {
      renderLayout('/shopping-list');
      expect(screen.queryByText('THERMOCOOK')).toBeNull();
    });

    it('masque le Header sur une liste partagée', () => {
      renderLayout('/shared/tok123');
      expect(screen.queryByText('THERMOCOOK')).toBeNull();
    });
  });

  describe('visibilité de la BottomNav', () => {
    it('affiche la BottomNav sur la page d\'accueil', () => {
      renderLayout('/');
      expect(screen.getByText('Découvrir')).toBeInTheDocument();
    });

    it('affiche la BottomNav sur une fiche recette (overlay)', () => {
      renderLayout('/recipes/abc-123');
      expect(screen.getByText('Découvrir')).toBeInTheDocument();
    });

    it('masque la BottomNav en mode cuisine', () => {
      renderLayout('/recipes/abc-123/cooking');
      expect(screen.queryByText('Découvrir')).toBeNull();
    });

    it('masque la BottomNav sur /login', () => {
      renderLayout('/login');
      expect(screen.queryByText('Découvrir')).toBeNull();
    });

    it('masque la BottomNav sur une liste partagée', () => {
      renderLayout('/shared/tok123');
      expect(screen.queryByText('Découvrir')).toBeNull();
    });
  });

  describe('intégration avec le store de recherche', () => {
    it('la saisie dans la barre de recherche alimente le store', () => {
      renderLayout('/');
      fireEvent.change(screen.getByPlaceholderText('Envie de cuisiner quoi ?'), {
        target: { value: 'tarte' },
      });
      expect(useSearchStore.getState().searchQuery).toBe('tarte');
    });

    it('la navigation via la BottomNav efface la recherche', () => {
      useSearchStore.setState({ searchQuery: 'tarte' });
      renderLayout('/');
      fireEvent.click(screen.getByText('Catalogue').closest('button')!);
      expect(useSearchStore.getState().searchQuery).toBe('');
    });

    it('la navigation via le Header efface la recherche', () => {
      useSearchStore.setState({ searchQuery: 'tarte' });
      renderLayout('/');
      fireEvent.click(screen.getByText('THERMOCOOK'));
      expect(useSearchStore.getState().searchQuery).toBe('');
    });
  });
});
