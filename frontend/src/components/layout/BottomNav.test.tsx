// frontend/src/components/layout/BottomNav.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from './BottomNav';
import type { User } from '../../api';

const mockNavigate = vi.fn();
const mockLocation = { pathname: '/other' };

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

describe('BottomNav', () => {
  beforeEach(() => mockNavigate.mockClear());

  describe('utilisateur connecté', () => {
    it('affiche les 4 entrées de navigation', () => {
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      expect(screen.getByText('Découvrir')).toBeInTheDocument();
      expect(screen.getByText('Catalogue')).toBeInTheDocument();
      expect(screen.getByText('Courses')).toBeInTheDocument();
      expect(screen.getByText('Favoris')).toBeInTheDocument();
    });

    it('navigue vers / au clic sur Découvrir', () => {
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      fireEvent.click(screen.getByText('Découvrir').closest('button')!);
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('navigue vers /recipes au clic sur Catalogue', () => {
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      fireEvent.click(screen.getByText('Catalogue').closest('button')!);
      expect(mockNavigate).toHaveBeenCalledWith('/recipes');
    });

    it('navigue vers /shopping-list au clic sur Courses', () => {
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      fireEvent.click(screen.getByText('Courses').closest('button')!);
      expect(mockNavigate).toHaveBeenCalledWith('/shopping-list');
    });

    it('navigue vers /favorites au clic sur Favoris', () => {
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      fireEvent.click(screen.getByText('Favoris').closest('button')!);
      expect(mockNavigate).toHaveBeenCalledWith('/favorites');
    });

    it('appelle onNavClick au clic sur Découvrir', () => {
      const onNavClick = vi.fn();
      render(<BottomNav onNavClick={onNavClick} user={fakeUser} />);
      fireEvent.click(screen.getByText('Découvrir').closest('button')!);
      expect(onNavClick).toHaveBeenCalledOnce();
    });

    it('appelle onNavClick au clic sur Catalogue', () => {
      const onNavClick = vi.fn();
      render(<BottomNav onNavClick={onNavClick} user={fakeUser} />);
      fireEvent.click(screen.getByText('Catalogue').closest('button')!);
      expect(onNavClick).toHaveBeenCalledOnce();
    });

    it('appelle onNavClick au clic sur Courses', () => {
      const onNavClick = vi.fn();
      render(<BottomNav onNavClick={onNavClick} user={fakeUser} />);
      fireEvent.click(screen.getByText('Courses').closest('button')!);
      expect(onNavClick).toHaveBeenCalledOnce();
    });

    it('appelle onNavClick au clic sur Favoris', () => {
      const onNavClick = vi.fn();
      render(<BottomNav onNavClick={onNavClick} user={fakeUser} />);
      fireEvent.click(screen.getByText('Favoris').closest('button')!);
      expect(onNavClick).toHaveBeenCalledOnce();
    });
  });

  describe('onglet actif', () => {
    beforeEach(() => {
      mockLocation.pathname = '/other';
    });

    it('marque Découvrir comme actif sur /', () => {
      mockLocation.pathname = '/';
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      expect(screen.getByText('Découvrir').closest('button')!).toHaveAttribute('aria-current', 'page');
      expect(screen.getByText('Catalogue').closest('button')!).not.toHaveAttribute('aria-current');
    });

    it('marque Catalogue comme actif sur /recipes', () => {
      mockLocation.pathname = '/recipes';
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      expect(screen.getByText('Catalogue').closest('button')!).toHaveAttribute('aria-current', 'page');
    });

    it('marque Catalogue comme actif sur /recipes/:id (overlay recette)', () => {
      mockLocation.pathname = '/recipes/abc-123';
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      expect(screen.getByText('Catalogue').closest('button')!).toHaveAttribute('aria-current', 'page');
    });

    it('marque Courses comme actif sur /shopping-list', () => {
      mockLocation.pathname = '/shopping-list';
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      expect(screen.getByText('Courses').closest('button')!).toHaveAttribute('aria-current', 'page');
    });

    it('marque Favoris comme actif sur /favorites', () => {
      mockLocation.pathname = '/favorites';
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      expect(screen.getByText('Favoris').closest('button')!).toHaveAttribute('aria-current', 'page');
    });

    it("aucun onglet actif sur une route hors menu (ex: /profile)", () => {
      mockLocation.pathname = '/profile';
      render(<BottomNav onNavClick={() => {}} user={fakeUser} />);
      screen.getAllByRole('button').forEach(btn => {
        expect(btn).not.toHaveAttribute('aria-current');
      });
    });
  });

  describe('utilisateur non connecté', () => {
    it('affiche uniquement Découvrir et Catalogue', () => {
      render(<BottomNav onNavClick={() => {}} user={null} />);
      expect(screen.getByText('Découvrir')).toBeInTheDocument();
      expect(screen.getByText('Catalogue')).toBeInTheDocument();
    });

    it('masque le menu Courses', () => {
      render(<BottomNav onNavClick={() => {}} user={null} />);
      expect(screen.queryByText('Courses')).toBeNull();
    });

    it('masque le menu Favoris', () => {
      render(<BottomNav onNavClick={() => {}} user={null} />);
      expect(screen.queryByText('Favoris')).toBeNull();
    });

    it('affiche exactement 2 boutons', () => {
      render(<BottomNav onNavClick={() => {}} user={null} />);
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });
  });
});
