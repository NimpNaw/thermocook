import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('api', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ── login ──────────────────────────────────────────────────────────────────

  it('login retourne les infos utilisateur', async () => {
    const fakeUser = { id: 1, username: 'alice', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeResponse(fakeUser));
    const user = await api.login('alice', 'secret');
    expect(user).toEqual(fakeUser);
  });

  it('login ne stocke rien dans localStorage', async () => {
    const fakeUser = { id: 1, username: 'alice', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeResponse(fakeUser));
    await api.login('alice', 'secret');
    expect(localStorage.getItem('thermocook_token')).toBeNull();
  });

  it('login lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 401));
    await expect(api.login('alice', 'wrong')).rejects.toThrow('Identifiants incorrects');
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  it('logout appelle POST /api/logout', async () => {
    mockFetch.mockResolvedValue(makeResponse({ ok: true }));
    await api.logout();
    expect(mockFetch).toHaveBeenCalledWith('/api/logout', { method: 'POST' });
  });

  // ── getCurrentUser ─────────────────────────────────────────────────────────

  it('getCurrentUser retourne l\'utilisateur courant', async () => {
    const fakeUser = { id: 1, username: 'alice', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeResponse(fakeUser));
    const user = await api.getCurrentUser();
    expect(user).toEqual(fakeUser);
  });

  it('getCurrentUser lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getCurrentUser()).rejects.toThrow('Non authentifié');
  });

  // ── getRecipes ─────────────────────────────────────────────────────────────

  it('getRecipes appelle /api/recipes avec offset et limit', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.getRecipes(10, 5);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/recipes?offset=10&limit=5',
      undefined
    );
  });

  // ── searchRecipes ──────────────────────────────────────────────────────────

  it('searchRecipes encode correctement la query', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.searchRecipes('tarte aux pommes');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('tarte%20aux%20pommes');
  });

  // ── apiFetch émet l'événement unauthorized sur 401 ────────────────────────

  it('un 401 déclenche l\'événement thermocook:unauthorized', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 401));
    const listener = vi.fn();
    window.addEventListener('thermocook:unauthorized', listener);
    await expect(api.getRecipes()).rejects.toThrow();
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('thermocook:unauthorized', listener);
  });

  // ── importPackage ──────────────────────────────────────────────────────────

  it('importPackage lève une erreur si conflit 409 avec le message du backend', async () => {
    mockFetch.mockResolvedValue(makeResponse({ detail: 'Un import est déjà en cours' }, 409));
    await expect(api.importPackage('url', 'http://example.com/pkg.tar.gz')).rejects.toThrow(
      'Un import est déjà en cours'
    );
  });

  // ── getRecipesBulk ─────────────────────────────────────────────────────────

  it('getRecipesBulk retourne [] sans faire de requête si ids vide', async () => {
    const result = await api.getRecipesBulk([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── getRecipe ──────────────────────────────────────────────────────────────

  it('getRecipe retourne la recette', async () => {
    const fakeRecipe = { id: 'r1', title: 'Tarte', slug: 'tarte' };
    mockFetch.mockResolvedValue(makeResponse(fakeRecipe));
    const recipe = await api.getRecipe('r1');
    expect(recipe).toEqual(fakeRecipe);
  });

  it('getRecipe lève une erreur si non trouvée', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 404));
    await expect(api.getRecipe('r99')).rejects.toThrow('Recette non trouvée');
  });

  // ── getRecipesRandom ───────────────────────────────────────────────────────

  it('getRecipesRandom appelle /api/recipes/random avec limit', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.getRecipesRandom(6);
    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/random?limit=6', undefined);
  });

  // ── syncFavorites ──────────────────────────────────────────────────────────

  it('syncFavorites envoie les IDs en JSON et retourne les IDs sauvegardés', async () => {
    mockFetch.mockResolvedValue(makeResponse({ status: 'success', saved_ids: ['r1', 'r2'] }, 200));
    const saved = await api.syncFavorites(['r1', 'r2']);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/favorites/sync');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(['r1', 'r2']);
    expect(saved).toEqual(['r1', 'r2']);
  });

  // ── getNote ────────────────────────────────────────────────────────────────

  it('getNote retourne la note si ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({ note: 'Ma note' }));
    const note = await api.getNote('r1');
    expect(note).toBe('Ma note');
  });

  it('getNote retourne "" si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 404));
    const note = await api.getNote('r1');
    expect(note).toBe('');
  });

  // ── register ──────────────────────────────────────────────────────────────

  it('register lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 400));
    await expect(api.register({ username: 'bob', password: 'x' })).rejects.toThrow('Erreur lors de l\'inscription');
  });
});
