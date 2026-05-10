const API_URL = '/api';

// Wrapper fetch centralisé : intercepte les 401 et émet un événement global
// pour que useAuth puisse déclencher le logout sans couplage direct.
async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('thermocook:unauthorized'));
  }
  return response;
}

export interface Recipe {
  id: string;
  title: string;
  slug: string;
  folder_name?: string;
  difficulty?: string;
  total_time?: number;
  portions?: string;
  image_main?: string;
  dominant_color?: string;
  category?: string;
  ingredients_json?: { raw: string }[];
  steps_json?: { text: string }[];
  nutrition_json?: any;
}

export interface User {
  id: number;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AdminStats {
  recipes: number;
  users: number;
  favorites: number;
  notes: number;
}

export interface ImportStatus {
  status: 'pending' | 'downloading' | 'extracting' | 'importing' | 'done' | 'error';
  progress: number;
  message: string;
  errors?: string[];
}

export interface ActiveImportStatus extends ImportStatus {
  job_id: string;
  errors: string[];
}

export interface ImportLogEntry {
  id: number;
  source: string;
  error: string;
  created_at: string;
  is_resolved: boolean;
}

export interface SyncResult {
  status: 'done' | 'error';
  added?: number;
  updated?: number;
  deleted?: number;
  errors?: number;
  error_details?: string[];
  stale_in_db?: string[];
  message?: string;
}

export interface SyncStatusResponse {
  running: boolean;
  result: SyncResult | null;
  processed: number;
  total: number;
  current_recipe: string;
  errors: number;
}

export const api = {
  getShoppingList: async (): Promise<{ 
    categories: Record<string, { text: string; recipe: string; recipe_id: string; is_direct: boolean; raw: string }[]>,
    recipes: { id: string; title: string }[] 
  }> => {
    const response = await apiFetch(`${API_URL}/shopping-list`);
    return response.json();
  },

  addToShoppingList: async (recipeId: string): Promise<void> => {
    await apiFetch(`${API_URL}/shopping-list/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipeId }),
    });
  },

  excludeIngredientFromShoppingList: async (recipeId: string, ingredientRaw: string): Promise<void> => {
    await apiFetch(`${API_URL}/shopping-list/exclude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipeId, ingredient_raw: ingredientRaw }),
    });
  },

  removeRecipeFromShoppingList: async (recipeId: string): Promise<void> => {
    await apiFetch(`${API_URL}/shopping-list/recipe/${recipeId}`, { method: 'DELETE' });
  },

  shareShoppingList: async (): Promise<{ token: string; expires_at: string }> => {
    const response = await apiFetch(`${API_URL}/shopping-list/share`, { method: 'POST' });
    if (!response.ok) throw new Error('Erreur lors de la génération du lien de partage');
    return response.json();
  },

  getSharedShoppingList: async (token: string): Promise<{
    categories: Record<string, { text: string; recipe: string; recipe_id: string; is_direct: boolean; raw: string }[]>,
    recipes: { id: string; title: string }[],
    owner: string,
    expires_at: string
  }> => {
    const response = await fetch(`${API_URL}/shared-list/${token}`);
    if (response.status === 404) throw new Error('Ce lien de partage est introuvable');
    if (response.status === 403) throw new Error('Ce lien de partage a expiré');
    if (!response.ok) throw new Error('Erreur serveur. Veuillez réessayer.');
    return response.json().catch(() => {
      throw new Error('Format de réponse invalide du serveur');
    });
  },

  login: async (username: string, password: string): Promise<User> => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Identifiants incorrects');
    return response.json();
  },

  logout: async (): Promise<void> => {
    await fetch(`${API_URL}/logout`, { method: 'POST' });
  },

  register: async (user: any): Promise<User> => {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!response.ok) throw new Error('Erreur lors de l\'inscription');
    return response.json();
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiFetch(`${API_URL}/users/me`);
    if (!response.ok) throw new Error('Non authentifié');
    return response.json();
  },

  getRecipes: async (offset = 0, limit = 20, category?: string, sort?: string): Promise<Recipe[]> => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (category) params.set('category', category);
    if (sort) params.set('sort', sort);
    const response = await apiFetch(`${API_URL}/recipes?${params}`);
    if (!response.ok) throw new Error('Erreur lors de la récupération des recettes');
    return response.json();
  },

  getRecipesRandom: async (limit = 12): Promise<Recipe[]> => {
    const response = await apiFetch(`${API_URL}/recipes/random?limit=${limit}`);
    if (!response.ok) throw new Error('Erreur lors de la récupération des suggestions');
    return response.json();
  },

  getRecipesSeasonal: async (limit = 6, month?: number): Promise<Recipe[]> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (month !== undefined) params.set('month', String(month));
    const response = await apiFetch(`${API_URL}/recipes/seasonal?${params}`);
    if (!response.ok) throw new Error('Erreur lors de la récupération des recettes de saison');
    return response.json();
  },

  searchRecipes: async (query: string, offset = 0, limit = 20): Promise<Recipe[]> => {
    const response = await apiFetch(`${API_URL}/recipes/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Erreur lors de la recherche');
    return response.json();
  },

  getFavorites: async (): Promise<Recipe[]> => {
    const response = await apiFetch(`${API_URL}/recipes/favorites`);
    if (!response.ok) throw new Error('Erreur lors de la récupération des favoris');
    return response.json();
  },

  getAdminStats: async (): Promise<AdminStats> => {
    const response = await apiFetch(`${API_URL}/admin/stats`);
    if (!response.ok) throw new Error('Accès refusé');
    return response.json();
  },

  getAdminUsers: async (): Promise<User[]> => {
    const response = await apiFetch(`${API_URL}/admin/users`);
    if (!response.ok) throw new Error('Accès refusé');
    return response.json();
  },

  createAdminUser: async (username: string, password: string, is_admin: boolean): Promise<User> => {
    const response = await apiFetch(`${API_URL}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, is_admin }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Erreur lors de la création');
    }
    return response.json();
  },

  changeAdminPassword: async (userId: number, newPassword: string): Promise<void> => {
    const response = await apiFetch(`${API_URL}/admin/users/${userId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    });
    if (!response.ok) throw new Error('Erreur lors du changement de mot de passe');
  },

  deleteAdminUser: async (userId: number): Promise<void> => {
    const response = await apiFetch(`${API_URL}/admin/users/${userId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Suppression impossible');
  },

  importPackage: async (source: 'url' | 'path', value: string): Promise<{ job_id: string }> => {
    const response = await apiFetch(`${API_URL}/admin/import-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, value }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Erreur lors du démarrage de l\'import');
    }
    return response.json();
  },

  getImportStatus: async (jobId: string): Promise<ImportStatus> => {
    const response = await apiFetch(`${API_URL}/admin/import-status/${jobId}`);
    if (!response.ok) throw new Error('Job inconnu');
    return response.json();
  },

  getActiveImportJob: async (): Promise<ActiveImportStatus | null> => {
    const response = await apiFetch(`${API_URL}/admin/import-status/active`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Erreur lors de la récupération du job actif');
    return response.json();
  },

  getNote: async (recipeId: string): Promise<string> => {
    const response = await apiFetch(`${API_URL}/recipes/${recipeId}/notes`);
    if (!response.ok) return '';
    const data = await response.json();
    return data.note ?? '';
  },

  saveNote: async (recipeId: string, noteText: string): Promise<void> => {
    await apiFetch(`${API_URL}/recipes/${recipeId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text: noteText }),
    });
  },

  syncFavorites: async (ids: string[]): Promise<string[]> => {
    const resp = await apiFetch(`${API_URL}/favorites/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids),
    });
    if (!resp.ok) throw new Error(`sync failed: ${resp.status}`);
    const data = await resp.json();
    return data.saved_ids ?? ids;
  },

  getRecipesBulk: async (ids: string[]): Promise<Recipe[]> => {
    if (ids.length === 0) return [];
    const response = await apiFetch(`${API_URL}/recipes/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_ids: ids.slice(0, 100) }),
    });
    if (!response.ok) throw new Error('Erreur lors de la récupération des recettes');
    return response.json();
  },

  getRecipe: async (id: string): Promise<Recipe> => {
    const response = await apiFetch(`${API_URL}/recipes/${id}`);
    if (!response.ok) throw new Error('Recette non trouvée');
    return response.json();
  },

  getImportErrors: async (): Promise<ImportLogEntry[]> => {
    const response = await apiFetch(`${API_URL}/admin/import-errors`);
    if (!response.ok) throw new Error('Accès refusé');
    return response.json();
  },

  resolveImportError: async (errorId: number): Promise<void> => {
    await apiFetch(`${API_URL}/admin/import-errors/${errorId}/resolve`, { method: 'POST' });
  },

  getAlerts: async (): Promise<{ unresolved_errors: number }> => {
    const response = await apiFetch(`${API_URL}/admin/alerts`);
    if (!response.ok) throw new Error('Accès refusé');
    return response.json();
  },

  syncCatalog: async (): Promise<{ status: string }> => {
    const response = await apiFetch(`${API_URL}/admin/sync-catalog`, { method: 'POST' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Erreur lors du démarrage de la synchronisation');
    }
    return response.json();
  },

  getSyncStatus: async (): Promise<SyncStatusResponse> => {
    const response = await apiFetch(`${API_URL}/admin/sync-catalog/status`);
    if (!response.ok) throw new Error('Accès refusé');
    return response.json();
  },

  getImportLogUrl: (jobId: string): string => `${API_URL}/admin/import-status/${jobId}/log`,

  getSyncLogUrl: (): string => `${API_URL}/admin/sync-catalog/log`,

  cleanupImages: async (): Promise<{ deleted: number }> => {
    const response = await apiFetch(`${API_URL}/admin/cleanup-images`, { method: 'POST' });
    if (!response.ok) throw new Error('Erreur lors du nettoyage');
    return response.json();
  },

  clearRecipes: async (): Promise<{ deleted: number }> => {
    const response = await apiFetch(`${API_URL}/admin/clear-recipes`, { method: 'POST' });
    if (!response.ok) throw new Error('Erreur lors de la suppression des recettes');
    return response.json();
  },

};
