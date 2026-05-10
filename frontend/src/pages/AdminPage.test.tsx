// frontend/src/pages/AdminPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from './AdminPage';
import { ToastProvider } from '../context/ToastContext';
import * as apiModule from '../api';


const mockAdmin = { id: 1, username: 'admin', is_admin: true, is_active: true, created_at: '2024-01-01' };
const mockStats = { recipes: 100, users: 2, favorites: 10, notes: 5 };
const mockShowToast = vi.fn();

function renderAdmin() {
  return render(
    <MemoryRouter>
      <ToastProvider showToast={mockShowToast}>
        <AdminPage currentUser={mockAdmin} authLoading={false} />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockShowToast.mockReset();
  vi.spyOn(apiModule.api, 'getAdminStats').mockResolvedValue(mockStats);
  vi.spyOn(apiModule.api, 'getAdminUsers').mockResolvedValue([mockAdmin]);
  vi.spyOn(apiModule.api, 'getAlerts').mockResolvedValue({ unresolved_errors: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminPage — sync progress', () => {
  it('affiche la barre de progression pendant la sync', async () => {
    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false,
      result: null,
      processed: 0,
      total: 0,
      current_recipe: '',
      errors: 0,
    });
    vi.spyOn(apiModule.api, 'syncCatalog').mockResolvedValue({ status: 'started' });
    
    let pollCount = 0;
    vi.spyOn(apiModule.api, 'getSyncStatus').mockImplementation(async () => {
      pollCount++;
      if (pollCount === 2) { 
        return { 
          running: true, 
          result: null, 
          processed: 150, 
          total: 500,
          current_recipe: 'recette_en_cours',
          errors: 0
        };
      }
      return { running: false, result: null, processed: 0, total: 0, current_recipe: '', errors: 0 };
    });

    renderAdmin();
    const btn = await screen.findByText(/Synchronisation complète/i);
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/150/)).toBeInTheDocument();
      expect(screen.getByText(/500 recettes/)).toBeInTheDocument();
      expect(screen.getByText(/Traitement : recette_en_cours/)).toBeInTheDocument();
    }, { timeout: 15000 });
  });

  it('affiche le résumé final après la sync', async () => {
    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false,
      result: null,
      processed: 0,
      total: 0,
      current_recipe: '',
      errors: 0,
    });
    vi.spyOn(apiModule.api, 'syncCatalog').mockResolvedValue({ status: 'started' });
    
    let pollCount = 0;
    vi.spyOn(apiModule.api, 'getSyncStatus').mockImplementation(async () => {
      pollCount++;
      if (pollCount === 2) {
        return {
          running: false,
          result: { status: 'done', added: 42, updated: 8, deleted: 1, errors: 0 },
          processed: 500,
          total: 500,
          current_recipe: 'Terminé',
          errors: 0
        };
      }
      return { running: false, result: null, processed: 0, total: 0, current_recipe: '', errors: 0 };
    });

    renderAdmin();
    const btn = await screen.findByText(/Synchronisation complète/i);
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/42 ajout/)).toBeInTheDocument();
      expect(screen.getByText(/8 màj/)).toBeInTheDocument();
    }, { timeout: 15000 });
  });

  it('réinitialise le résumé au prochain clic sur sync', async () => {
    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false,
      result: null,
      processed: 0,
      total: 0,
      current_recipe: '',
      errors: 0,
    });
    vi.spyOn(apiModule.api, 'syncCatalog').mockResolvedValue({ status: 'started' });

    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false,
      result: { status: 'done', added: 5, updated: 0, deleted: 0, errors: 0 },
      processed: 100,
      total: 100,
      current_recipe: 'Terminé',
      errors: 0
    });

    renderAdmin();
    const btn = await screen.findByText(/Synchronisation complète/i);

    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/5 ajout/)).toBeInTheDocument(), { timeout: 15000 });

    await userEvent.click(btn);
    await waitFor(() => expect(screen.queryByText(/5 ajout/)).toBeNull(), { timeout: 15000 });
  });
});

describe('AdminPage — bouton Log', () => {
  it('affiche le bouton Log import même sans erreurs après import réussi', async () => {
    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false, result: null, processed: 0, total: 0, current_recipe: '', errors: 0,
    });
    vi.spyOn(apiModule.api, 'getActiveImportJob').mockResolvedValue({
      job_id: 'test-job-abc',
      status: 'done',
      progress: 100,
      message: 'Terminé : +42 ajout(s)',
      errors: [],
    });

    renderAdmin();

    await waitFor(() => {
      // Le lien de log doit exister même avec errors=[]
      const link = screen.getByRole('link', { name: /Log/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('download');
    }, { timeout: 3000 });
  });

  it('affiche le bouton Log sync même sans erreurs après sync réussie', async () => {
    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false,
      result: { status: 'done', added: 5, updated: 0, deleted: 0, errors: 0 },
      processed: 100, total: 100, current_recipe: '', errors: 0,
    });
    vi.spyOn(apiModule.api, 'getActiveImportJob').mockResolvedValue(null);

    renderAdmin();

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Log/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('download');
    }, { timeout: 3000 });
  });
});

describe('AdminPage — vider les recettes', () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false, result: null, processed: 0, total: 0, current_recipe: '', errors: 0,
    });
    vi.spyOn(apiModule.api, 'getActiveImportJob').mockResolvedValue(null);
  });

  it("appelle clearRecipes si l'utilisateur confirme", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const spy = vi.spyOn(apiModule.api, 'clearRecipes').mockResolvedValue({ deleted: 10 });

    renderAdmin();
    const btn = await screen.findByRole('button', { name: /Vider les recettes/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  it("n'appelle pas clearRecipes si l'utilisateur annule", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const spy = vi.spyOn(apiModule.api, 'clearRecipes').mockResolvedValue({ deleted: 0 });

    renderAdmin();
    const btn = await screen.findByRole('button', { name: /Vider les recettes/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('affiche un toast de succès avec le nombre de recettes supprimées', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(apiModule.api, 'clearRecipes').mockResolvedValue({ deleted: 42 });

    renderAdmin();
    const btn = await screen.findByRole('button', { name: /Vider les recettes/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Base vidée : 42 recette(s) supprimée(s)', 'success');
    });
  });
});

describe("AdminPage — polling import : une seule notification d'erreur", () => {
  it("n'affiche qu'une seule notification si le serveur répond lentement puis échoue", async () => {
    vi.useFakeTimers();

    vi.spyOn(apiModule.api, 'getSyncStatus').mockResolvedValue({
      running: false, result: null, processed: 0, total: 0, current_recipe: '', errors: 0,
    });
    vi.spyOn(apiModule.api, 'getActiveImportJob').mockResolvedValue({
      job_id: 'test-job',
      status: 'running',
      progress: 50,
      message: 'En cours...',
      errors: [],
    });

    // getImportStatus est lent : ne rejette que quand on l'appelle manuellement.
    const pendingRejects: Array<(e: Error) => void> = [];
    vi.spyOn(apiModule.api, 'getImportStatus').mockImplementation(
      () => new Promise((_, reject) => { pendingRejects.push(reject); })
    );

    renderAdmin();

    // Laisser les effets initiaux et getActiveImportJob se résoudre
    await vi.advanceTimersByTimeAsync(100);

    // Avancer de 6001ms :
    // - setInterval (buggy) : 3 ticks (2000, 4000, 6000ms) → 3 requêtes en vol
    // - setTimeout récursif (fix) : 1 tick (2000ms), attend la réponse → 1 requête
    await vi.advanceTimersByTimeAsync(6001);

    // Rejeter toutes les requêtes en attente
    pendingRejects.forEach(r => r(new Error('Server unavailable')));
    await vi.advanceTimersByTimeAsync(0);

    const errorToasts = mockShowToast.mock.calls.filter(
      ([msg]: [string]) => msg === "Impossible de récupérer l'état de l'import"
    );
    expect(errorToasts).toHaveLength(1);

    vi.useRealTimers();
  });
});
