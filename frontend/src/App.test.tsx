// Tests du composant racine : routage par chemin (architecture keep-alive via
// listPathRef), overlays fiche recette / mode cuisine, et overlay de recherche.
// Les pages sont mockées (elles ont leurs propres tests) — on teste ici la
// logique d'aiguillage de App.tsx, jusqu'ici à 0 % de couverture.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { useSearchStore } from './store/useSearchStore';

vi.mock('./pages/HomePage', () => ({ HomePage: () => <div>page-home</div> }));
vi.mock('./pages/RecipesPage', () => ({ RecipesPage: () => <div>page-recipes</div> }));
vi.mock('./pages/FavoritesPage', () => ({ FavoritesPage: () => <div>page-favorites</div> }));
vi.mock('./pages/LoginPage', () => ({ LoginPage: () => <div>page-login</div> }));
vi.mock('./pages/ShoppingListPage', () => ({ ShoppingListPage: () => <div>page-shopping</div> }));
vi.mock('./pages/SharedListPage', () => ({ SharedListPage: () => <div>page-shared</div> }));
vi.mock('./pages/ProfilePage', () => ({ ProfilePage: () => <div>page-profile</div> }));
vi.mock('./pages/AdminPage', () => ({ AdminPage: () => <div>page-admin</div> }));
vi.mock('./pages/RecipeDetailPage', () => ({ RecipeDetailPage: () => <div>overlay-detail</div> }));
vi.mock('./components/CookingMode', () => ({ CookingMode: () => <div>overlay-cooking</div> }));

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, refreshUser: vi.fn(), logout: vi.fn() }),
}));
// Debounce identitaire : la recherche est testée sans attendre 300 ms
vi.mock('./hooks/useDebounce', () => ({ useDebounce: (v: unknown) => v }));
vi.mock('./hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    api: {
      ...actual.api,
      searchRecipes: vi.fn().mockResolvedValue([]),
      syncFavorites: vi.fn().mockResolvedValue([]),
    },
  };
});

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  useSearchStore.setState({ searchQuery: '' });
});

describe('App — aiguillage par chemin', () => {
  it.each([
    ['/', 'page-home'],
    ['/recipes', 'page-recipes'],
    ['/favorites', 'page-favorites'],
    ['/login', 'page-login'],
    ['/shopping-list', 'page-shopping'],
    ['/profile', 'page-profile'],
    ['/admin', 'page-admin'],
  ])('affiche la bonne page pour %s', (path, expected) => {
    renderApp(path);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('rend SharedListPage via une Route (useParams doit recevoir :token)', () => {
    renderApp('/shared/abc-123');
    expect(screen.getByText('page-shared')).toBeInTheDocument();
  });
});

// Petit bouton de navigation pour simuler un vrai parcours utilisateur
// (le keep-alive ne s'observe qu'en naviguant, pas en deep link direct).
function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>naviguer-vers-{to}</button>;
}

describe('App — overlays recette et cuisine', () => {
  it('affiche la fiche recette en overlay sur /recipes/:id', () => {
    renderApp('/recipes/r1');
    expect(screen.getByText('overlay-detail')).toBeInTheDocument();
  });

  it('affiche le mode cuisine en overlay sur /recipes/:id/cooking', () => {
    renderApp('/recipes/r1/cooking');
    expect(screen.getByText('overlay-cooking')).toBeInTheDocument();
  });

  it('keep-alive : la page liste reste montée SOUS l\'overlay après navigation', () => {
    // C'est le comportement signature de l'architecture (listPathRef) : en
    // naviguant du catalogue vers une fiche, le catalogue ne se démonte pas.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/recipes']}>
          <App />
          <NavigateButton to="/recipes/r1" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('page-recipes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /naviguer-vers-\/recipes\/r1/ }));

    // Les deux sont dans le DOM : l'overlay au-dessus, le catalogue en dessous
    expect(screen.getByText('overlay-detail')).toBeInTheDocument();
    expect(screen.getByText('page-recipes')).toBeInTheDocument();
  });
});

describe('App — overlay de recherche', () => {
  it('affiche les résultats à la place de la page quand la requête dépasse 2 caractères', async () => {
    useSearchStore.setState({ searchQuery: 'tarte' });
    renderApp('/');

    expect(await screen.findByText(/Résultats pour "tarte"/)).toBeInTheDocument();
    expect(screen.queryByText('page-home')).not.toBeInTheDocument();
    expect(await screen.findByText(/aucune recette ne correspond/i)).toBeInTheDocument();
  });

  it('ne déclenche pas l\'overlay pour une requête de 2 caractères ou moins', () => {
    useSearchStore.setState({ searchQuery: 'ta' });
    renderApp('/');

    expect(screen.getByText('page-home')).toBeInTheDocument();
    expect(screen.queryByText(/Résultats pour/)).not.toBeInTheDocument();
  });

  it('le bouton Effacer restaure la page courante', async () => {
    useSearchStore.setState({ searchQuery: 'tarte' });
    renderApp('/');

    fireEvent.click(await screen.findByRole('button', { name: /effacer/i }));

    expect(await screen.findByText('page-home')).toBeInTheDocument();
  });
});
