// Régression de https://example.com/fabien/thermocook/issues/<bug-de-prod>
// Si SharedListPage est rendu hors d'un <Route path="/shared/:token">,
// `useParams` retourne {} et `loadList` n'envoie aucune requête → la page
// reste bloquée sur "Ouverture du paquet…". Ce test garantit qu'avec un
// Router correctement configuré, le fetch est bien déclenché avec le token.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SharedListPage } from './SharedListPage';
import { ToastProvider } from '../context/ToastContext';

const showToast = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  showToast.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // localStorage propre entre les tests
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider showToast={showToast}>
        <Routes>
          <Route path="/shared/:token" element={<SharedListPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('SharedListPage — fetch déclenché avec le token', () => {
  it("appelle /api/shared-list/<token> au montage", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        categories: { 'Épicerie': [{ text: '1 kg sucre', recipe: 'Brioche', recipe_id: 'r1', raw: '1 kg sucre' }] },
        recipes: [{ id: 'r1', title: 'Brioche' }],
        owner: 'alice',
        expires_at: '2099-01-01T00:00:00Z',
      }),
    });

    renderAt('/shared/abc-123');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/shared-list/abc-123');
    });
  });

  it("affiche le nom du propriétaire après chargement", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        categories: { 'Épicerie': [{ text: '1 kg sucre', recipe: 'Brioche', recipe_id: 'r1', raw: '1 kg sucre' }] },
        recipes: [{ id: 'r1', title: 'Brioche' }],
        owner: 'alice',
        expires_at: '2099-01-01T00:00:00Z',
      }),
    });

    renderAt('/shared/abc-123');

    expect(await screen.findByText(/alice/)).toBeInTheDocument();
  });

  it("affiche un message si le lien retourne 404", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'not found' }),
    });

    renderAt('/shared/expired-token');

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/expir|introuvable/i));
    });
  });
});

describe('SharedListPage — caches locaux corrompus', () => {
  it("hors-ligne avec cache de données corrompu : message d'erreur, pas de crash", async () => {
    localStorage.setItem('tc_shared_list_abc-123', '{"categories": {corrompu');
    fetchMock.mockRejectedValue(new Error('réseau coupé'));

    renderAt('/shared/abc-123');

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/impossible de charger/i));
    });
    expect(await screen.findByText(/vide ou n'existe plus/i)).toBeInTheDocument();
  });

  it('cache des coches corrompu : la liste se charge quand même', async () => {
    localStorage.setItem('tc_shared_checked_abc-123', '{corrompu');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        categories: { 'Épicerie': [{ text: '1 kg sucre', recipe: 'Brioche', recipe_id: 'r1', raw: '1 kg sucre' }] },
        recipes: [{ id: 'r1', title: 'Brioche' }],
        owner: 'alice',
        expires_at: '2099-01-01T00:00:00Z',
      }),
    });

    renderAt('/shared/abc-123');

    expect(await screen.findByText(/1 kg sucre/)).toBeInTheDocument();
  });
});
