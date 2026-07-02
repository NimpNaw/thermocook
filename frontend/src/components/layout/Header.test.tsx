import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import type { User } from '../../api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const fakeUser: User = {
  id: 1,
  username: 'alice',
  is_active: true,
  is_admin: false,
  created_at: '2024-01-01T00:00:00',
};

const defaultProps = {
  searchQuery: '',
  setSearchQuery: vi.fn(),
  onSearch: vi.fn((e: React.FormEvent) => e.preventDefault()),
  user: null,
};

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le logo THERMOCOOK', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('THERMOCOOK')).toBeInTheDocument();
  });

  it('navigue vers / au clic sur le logo', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByText('THERMOCOOK'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('appelle onNavigate avant de naviguer', () => {
    const onNavigate = vi.fn();
    render(<Header {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('THERMOCOOK'));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  describe('bouton compte', () => {
    it('affiche "Connexion" et navigue vers /login sans utilisateur', () => {
      render(<Header {...defaultProps} user={null} />);
      const button = screen.getByText('Connexion');
      fireEvent.click(button);
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('affiche le nom d\'utilisateur et navigue vers /profile si connecté', () => {
      render(<Header {...defaultProps} user={fakeUser} />);
      const button = screen.getByText('alice');
      fireEvent.click(button);
      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });
  });

  describe('barre de recherche', () => {
    it('affiche la valeur courante de la recherche', () => {
      render(<Header {...defaultProps} searchQuery="tarte" />);
      expect(screen.getByPlaceholderText('Envie de cuisiner quoi ?')).toHaveValue('tarte');
    });

    it('propage la saisie via setSearchQuery', () => {
      const setSearchQuery = vi.fn();
      render(<Header {...defaultProps} setSearchQuery={setSearchQuery} />);
      fireEvent.change(screen.getByPlaceholderText('Envie de cuisiner quoi ?'), {
        target: { value: 'soupe' },
      });
      expect(setSearchQuery).toHaveBeenCalledWith('soupe');
    });

    it('déclenche onSearch à la soumission du formulaire', () => {
      const onSearch = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(<Header {...defaultProps} onSearch={onSearch} />);
      fireEvent.submit(screen.getByPlaceholderText('Envie de cuisiner quoi ?').closest('form')!);
      expect(onSearch).toHaveBeenCalledOnce();
    });
  });
});
