import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('non connecté', () => {
    it('affiche un message et un bouton de connexion', () => {
      render(<ProfilePage user={null} favoritesCount={0} onLogout={() => {}} />);
      expect(screen.getByText("Vous n'êtes pas connecté.")).toBeInTheDocument();
      fireEvent.click(screen.getByText('Se connecter'));
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('connecté', () => {
    const user = { id: 1, username: 'alice' };

    it('affiche le nom d\'utilisateur et le compteur de favoris', () => {
      render(<ProfilePage user={user} favoritesCount={7} onLogout={() => {}} />);
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText('Recettes favorites')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('masque le bouton admin pour un utilisateur standard', () => {
      render(<ProfilePage user={user} favoritesCount={0} onLogout={() => {}} />);
      expect(screen.queryByText('Tableau de bord admin')).toBeNull();
    });

    it('affiche le bouton admin pour un admin et navigue vers /admin', () => {
      render(<ProfilePage user={{ ...user, is_admin: true }} favoritesCount={0} onLogout={() => {}} />);
      fireEvent.click(screen.getByText('Tableau de bord admin'));
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });

    it('la déconnexion appelle onLogout puis navigue vers /', () => {
      const onLogout = vi.fn();
      render(<ProfilePage user={user} favoritesCount={0} onLogout={onLogout} />);
      fireEvent.click(screen.getByText('Se déconnecter'));
      expect(onLogout).toHaveBeenCalledOnce();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
