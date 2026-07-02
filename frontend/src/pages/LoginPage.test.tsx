import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  },
}));

import { api } from '../api';

const mockedApi = vi.mocked(api);

function fillAndSubmit(username = 'alice', password = 'secret') {
  fireEvent.change(screen.getByPlaceholderText("Nom d'utilisateur"), {
    target: { value: username },
  });
  fireEvent.change(screen.getByPlaceholderText('Mot de passe'), {
    target: { value: password },
  });
  fireEvent.submit(screen.getByPlaceholderText('Mot de passe').closest('form')!);
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le formulaire de connexion par défaut', () => {
    render(<LoginPage onLoginSuccess={() => {}} />);
    expect(screen.getByText('Bon retour !')).toBeInTheDocument();
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
  });

  it('bascule vers le formulaire d\'inscription et revient', () => {
    render(<LoginPage onLoginSuccess={() => {}} />);

    fireEvent.click(screen.getByText("Pas encore de compte ? S'inscrire"));
    expect(screen.getByText('Créer un compte')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Déjà un compte ? Se connecter'));
    expect(screen.getByText('Bon retour !')).toBeInTheDocument();
  });

  it('connexion réussie : appelle api.login, onLoginSuccess et navigue vers /', async () => {
    mockedApi.login.mockResolvedValue({} as any);
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fillAndSubmit('alice', 'secret');

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledOnce());
    expect(mockedApi.login).toHaveBeenCalledWith('alice', 'secret');
    expect(mockedApi.register).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('connexion échouée : affiche le message d\'erreur, sans navigation', async () => {
    mockedApi.login.mockRejectedValue(new Error('Identifiants incorrects'));
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fillAndSubmit('alice', 'mauvais');

    expect(await screen.findByText('Identifiants incorrects')).toBeInTheDocument();
    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('erreur sans message : affiche un message générique', async () => {
    mockedApi.login.mockRejectedValue({});
    render(<LoginPage onLoginSuccess={() => {}} />);

    fillAndSubmit();

    expect(await screen.findByText('Une erreur est survenue')).toBeInTheDocument();
  });

  it('inscription : appelle api.register puis api.login', async () => {
    mockedApi.register.mockResolvedValue({} as any);
    mockedApi.login.mockResolvedValue({} as any);
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fireEvent.click(screen.getByText("Pas encore de compte ? S'inscrire"));
    fillAndSubmit('bob', 'pwd');

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledOnce());
    expect(mockedApi.register).toHaveBeenCalledWith({ username: 'bob', password: 'pwd' });
    expect(mockedApi.login).toHaveBeenCalledWith('bob', 'pwd');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('inscription échouée : affiche l\'erreur et ne tente pas la connexion', async () => {
    mockedApi.register.mockRejectedValue(new Error("Erreur lors de l'inscription"));
    render(<LoginPage onLoginSuccess={() => {}} />);

    fireEvent.click(screen.getByText("Pas encore de compte ? S'inscrire"));
    fillAndSubmit('bob', 'pwd');

    expect(await screen.findByText("Erreur lors de l'inscription")).toBeInTheDocument();
    expect(mockedApi.login).not.toHaveBeenCalled();
  });
});
