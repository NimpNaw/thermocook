import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { api } from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

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

  it('register envoie l\'utilisateur en JSON et retourne l\'utilisateur créé', async () => {
    const fakeUser = { id: 2, username: 'bob', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeResponse(fakeUser));
    const user = await api.register({ username: 'bob', password: 'x' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/register');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ username: 'bob', password: 'x' });
    expect(user).toEqual(fakeUser);
  });

  // ── getRecipes : sérialisation des paramètres et erreurs ──────────────────

  it('getRecipes sérialise category et sort dans l\'URL', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.getRecipes(0, 40, 'Plat principal', 'title');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/recipes?offset=0&limit=40&category=Plat+principal&sort=title',
      undefined
    );
  });

  it('getRecipes omet category et sort si absents', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.getRecipes();
    expect(mockFetch).toHaveBeenCalledWith('/api/recipes?offset=0&limit=20', undefined);
  });

  it('getRecipes lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getRecipes()).rejects.toThrow('Erreur lors de la récupération des recettes');
  });

  // ── searchRecipes : offset/limit et erreurs ────────────────────────────────

  it('searchRecipes sérialise offset et limit', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.searchRecipes('tarte', 40, 20);
    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/search?q=tarte&offset=40&limit=20', undefined);
  });

  it('searchRecipes lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.searchRecipes('tarte')).rejects.toThrow('Erreur lors de la recherche');
  });

  // ── getRecipesRandom / getRecipesSeasonal : erreurs et paramètres ─────────

  it('getRecipesRandom lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getRecipesRandom()).rejects.toThrow('Erreur lors de la récupération des suggestions');
  });

  it('getRecipesSeasonal appelle /api/recipes/seasonal avec limit seul par défaut', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.getRecipesSeasonal(6);
    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/seasonal?limit=6', undefined);
  });

  it('getRecipesSeasonal ajoute month si fourni (y compris 0 = janvier)', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    await api.getRecipesSeasonal(6, 0);
    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/seasonal?limit=6&month=0', undefined);
  });

  it('getRecipesSeasonal lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getRecipesSeasonal()).rejects.toThrow('Erreur lors de la récupération des recettes de saison');
  });

  // ── getFavorites ───────────────────────────────────────────────────────────

  it('getFavorites retourne les recettes favorites', async () => {
    mockFetch.mockResolvedValue(makeResponse([{ id: 'r1', title: 'Tarte', slug: 'tarte' }]));
    const favs = await api.getFavorites();
    expect(mockFetch).toHaveBeenCalledWith('/api/recipes/favorites', undefined);
    expect(favs).toHaveLength(1);
  });

  it('getFavorites lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getFavorites()).rejects.toThrow('Erreur lors de la récupération des favoris');
  });

  // ── liste de courses ───────────────────────────────────────────────────────

  it('getShoppingList retourne le contenu JSON', async () => {
    const list = { categories: { Épicerie: [] }, recipes: [] };
    mockFetch.mockResolvedValue(makeResponse(list));
    const result = await api.getShoppingList();
    expect(mockFetch).toHaveBeenCalledWith('/api/shopping-list', undefined);
    expect(result).toEqual(list);
  });

  it('addToShoppingList envoie recipe_id en JSON', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.addToShoppingList('r1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/shopping-list/add');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ recipe_id: 'r1' });
  });

  it('excludeIngredientFromShoppingList envoie recipe_id et ingredient_raw', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.excludeIngredientFromShoppingList('r1', '100g farine');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/shopping-list/exclude');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      recipe_id: 'r1',
      ingredient_raw: '100g farine',
    });
  });

  it('removeRecipeFromShoppingList appelle DELETE sur la bonne URL', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.removeRecipeFromShoppingList('r1');
    expect(mockFetch).toHaveBeenCalledWith('/api/shopping-list/recipe/r1', { method: 'DELETE' });
  });

  it('shareShoppingList retourne le token', async () => {
    mockFetch.mockResolvedValue(makeResponse({ token: 'tok', expires_at: '2026-01-01' }));
    const share = await api.shareShoppingList();
    expect(share.token).toBe('tok');
  });

  it('shareShoppingList lève une erreur si réponse non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.shareShoppingList()).rejects.toThrow('Erreur lors de la génération du lien de partage');
  });

  // ── getSharedShoppingList : cas d'erreur détaillés ─────────────────────────

  it('getSharedShoppingList lève une erreur spécifique sur 404', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 404));
    await expect(api.getSharedShoppingList('tok')).rejects.toThrow('Ce lien de partage est introuvable');
  });

  it('getSharedShoppingList lève une erreur spécifique sur 403 (expiré)', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getSharedShoppingList('tok')).rejects.toThrow('Ce lien de partage a expiré');
  });

  it('getSharedShoppingList lève une erreur générique sur 500', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getSharedShoppingList('tok')).rejects.toThrow('Erreur serveur. Veuillez réessayer.');
  });

  it('getSharedShoppingList lève une erreur si le JSON est invalide', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    } as unknown as Response);
    await expect(api.getSharedShoppingList('tok')).rejects.toThrow('Format de réponse invalide du serveur');
  });

  it('getSharedShoppingList retourne la liste si ok', async () => {
    const shared = { categories: {}, recipes: [], owner: 'alice', expires_at: '2026-01-01' };
    mockFetch.mockResolvedValue(makeResponse(shared));
    const result = await api.getSharedShoppingList('tok');
    expect(mockFetch).toHaveBeenCalledWith('/api/shared-list/tok');
    expect(result).toEqual(shared);
  });

  // ── endpoints admin ────────────────────────────────────────────────────────

  it('getAdminStats lève "Accès refusé" si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getAdminStats()).rejects.toThrow('Accès refusé');
  });

  it('getAdminUsers lève "Accès refusé" si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getAdminUsers()).rejects.toThrow('Accès refusé');
  });

  it('createAdminUser envoie le payload et retourne l\'utilisateur', async () => {
    const fakeUser = { id: 3, username: 'carol', is_active: true, is_admin: true, created_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeResponse(fakeUser));
    const user = await api.createAdminUser('carol', 'pwd', true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/admin/users');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      username: 'carol', password: 'pwd', is_admin: true,
    });
    expect(user).toEqual(fakeUser);
  });

  it('createAdminUser relaie le detail du backend en cas d\'erreur', async () => {
    mockFetch.mockResolvedValue(makeResponse({ detail: 'Nom déjà pris' }, 409));
    await expect(api.createAdminUser('carol', 'pwd', false)).rejects.toThrow('Nom déjà pris');
  });

  it('createAdminUser retombe sur un message générique si le corps d\'erreur est illisible', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);
    await expect(api.createAdminUser('carol', 'pwd', false)).rejects.toThrow('Erreur lors de la création');
  });

  it('changeAdminPassword lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.changeAdminPassword(1, 'newpwd')).rejects.toThrow('Erreur lors du changement de mot de passe');
  });

  it('changeAdminPassword envoie new_password en PATCH', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.changeAdminPassword(7, 'newpwd');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/admin/users/7/password');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ new_password: 'newpwd' });
  });

  it('deleteAdminUser lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 400));
    await expect(api.deleteAdminUser(1)).rejects.toThrow('Suppression impossible');
  });

  it('deleteAdminUser appelle DELETE sur la bonne URL', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.deleteAdminUser(7);
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/users/7', { method: 'DELETE' });
  });

  // ── import / sync ──────────────────────────────────────────────────────────

  it('importPackage retourne le job_id si ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({ job_id: 'j1' }));
    const result = await api.importPackage('url', 'https://example.com/pkg.tar.gz');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/admin/import-package');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      source: 'url', value: 'https://example.com/pkg.tar.gz',
    });
    expect(result.job_id).toBe('j1');
  });

  it('importPackage retombe sur un message générique sans detail', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);
    await expect(api.importPackage('path', '/tmp/pkg')).rejects.toThrow('Erreur lors du démarrage de l\'import');
  });

  it('getImportStatus lève "Job inconnu" si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 404));
    await expect(api.getImportStatus('j1')).rejects.toThrow('Job inconnu');
  });

  it('getImportStatus retourne le statut si ok', async () => {
    const status = { status: 'importing', progress: 50, message: 'En cours' };
    mockFetch.mockResolvedValue(makeResponse(status));
    const result = await api.getImportStatus('j1');
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/import-status/j1', undefined);
    expect(result).toEqual(status);
  });

  it('getActiveImportJob retourne null sur 404', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 404));
    const result = await api.getActiveImportJob();
    expect(result).toBeNull();
  });

  it('getActiveImportJob lève une erreur sur les autres statuts non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getActiveImportJob()).rejects.toThrow('Erreur lors de la récupération du job actif');
  });

  it('getActiveImportJob retourne le job actif si ok', async () => {
    const job = { job_id: 'j1', status: 'downloading', progress: 10, message: '', errors: [] };
    mockFetch.mockResolvedValue(makeResponse(job));
    const result = await api.getActiveImportJob();
    expect(result).toEqual(job);
  });

  it('getImportErrors lève "Accès refusé" si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getImportErrors()).rejects.toThrow('Accès refusé');
  });

  it('resolveImportError appelle POST sur la bonne URL', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.resolveImportError(42);
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/import-errors/42/resolve', { method: 'POST' });
  });

  it('getAlerts lève "Accès refusé" si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getAlerts()).rejects.toThrow('Accès refusé');
  });

  it('getAlerts retourne le compteur d\'erreurs si ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({ unresolved_errors: 2 }));
    const alerts = await api.getAlerts();
    expect(alerts).toEqual({ unresolved_errors: 2 });
  });

  it('syncCatalog relaie le detail du backend en cas d\'erreur', async () => {
    mockFetch.mockResolvedValue(makeResponse({ detail: 'Sync déjà en cours' }, 409));
    await expect(api.syncCatalog()).rejects.toThrow('Sync déjà en cours');
  });

  it('syncCatalog retourne le statut si ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({ status: 'started' }));
    const result = await api.syncCatalog();
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/sync-catalog', { method: 'POST' });
    expect(result).toEqual({ status: 'started' });
  });

  it('getSyncStatus lève "Accès refusé" si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 403));
    await expect(api.getSyncStatus()).rejects.toThrow('Accès refusé');
  });

  it('getImportLogUrl et getSyncLogUrl construisent les URLs de logs', () => {
    expect(api.getImportLogUrl('j1')).toBe('/api/admin/import-status/j1/log');
    expect(api.getSyncLogUrl()).toBe('/api/admin/sync-catalog/log');
  });

  it('cleanupImages lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.cleanupImages()).rejects.toThrow('Erreur lors du nettoyage');
  });

  it('cleanupImages retourne le nombre de fichiers supprimés', async () => {
    mockFetch.mockResolvedValue(makeResponse({ deleted: 4 }));
    const result = await api.cleanupImages();
    expect(result).toEqual({ deleted: 4 });
  });

  it('clearRecipes lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.clearRecipes()).rejects.toThrow('Erreur lors de la suppression des recettes');
  });

  // ── notes ──────────────────────────────────────────────────────────────────

  it('getNote retourne "" si le champ note est null', async () => {
    mockFetch.mockResolvedValue(makeResponse({ note: null }));
    const note = await api.getNote('r1');
    expect(note).toBe('');
  });

  it('saveNote envoie note_text en JSON', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));
    await api.saveNote('r1', 'Très bon');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/recipes/r1/notes');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ note_text: 'Très bon' });
  });

  // ── syncFavorites / getRecipesBulk ─────────────────────────────────────────

  it('syncFavorites lève une erreur avec le statut HTTP si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.syncFavorites(['r1'])).rejects.toThrow('sync failed: 500');
  });

  it('syncFavorites retombe sur les IDs envoyés si saved_ids absent', async () => {
    mockFetch.mockResolvedValue(makeResponse({ status: 'success' }));
    const saved = await api.syncFavorites(['r1', 'r2']);
    expect(saved).toEqual(['r1', 'r2']);
  });

  it('getRecipesBulk tronque à 100 IDs', async () => {
    mockFetch.mockResolvedValue(makeResponse([]));
    const ids = Array.from({ length: 150 }, (_, i) => `r${i}`);
    await api.getRecipesBulk(ids);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.recipe_ids).toHaveLength(100);
  });

  it('getRecipesBulk lève une erreur si non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));
    await expect(api.getRecipesBulk(['r1'])).rejects.toThrow('Erreur lors de la récupération des recettes');
  });
});
