// frontend/src/hooks/useFavorites.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFavorites } from './useFavorites';

vi.mock('../api', () => ({
  api: {
    // Par défaut : tous les IDs sont valides (le serveur retourne les mêmes)
    syncFavorites: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
  },
}));

import { api } from '../api';
const mockSyncFavorites = api.syncFavorites as ReturnType<typeof vi.fn>;

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('démarre avec une liste vide sans localStorage', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it('relit les favoris depuis localStorage', () => {
    localStorage.setItem('thermocook_favorites', JSON.stringify(['r1', 'r2']));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual(['r1', 'r2']);
  });

  it('toggleFavorite ajoute un favori absent et retourne true', () => {
    const { result } = renderHook(() => useFavorites());
    let added: boolean;
    act(() => {
      added = result.current.toggleFavorite('r42');
    });
    expect(result.current.favorites).toContain('r42');
    expect(added!).toBe(true);
  });

  it('toggleFavorite retire un favori présent et retourne false', () => {
    localStorage.setItem('thermocook_favorites', JSON.stringify(['r42']));
    const { result } = renderHook(() => useFavorites());
    let added: boolean;
    act(() => {
      added = result.current.toggleFavorite('r42');
    });
    expect(result.current.favorites).not.toContain('r42');
    expect(added!).toBe(false);
  });

  it('isFavorite retourne true si présent', () => {
    localStorage.setItem('thermocook_favorites', JSON.stringify(['r1']));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isFavorite('r1')).toBe(true);
  });

  it('isFavorite retourne false si absent', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isFavorite('r99')).toBe(false);
  });

  it('syncToServer appelle api.syncFavorites avec les favoris', async () => {
    localStorage.setItem('thermocook_favorites', JSON.stringify(['r1', 'r2']));
    const { result } = renderHook(() => useFavorites());
    await act(async () => {
      await result.current.syncToServer();
    });
    expect(mockSyncFavorites).toHaveBeenCalledWith(['r1', 'r2']);
  });

  it('syncToServer appelle api.syncFavorites même si favoris vides', async () => {
    const { result } = renderHook(() => useFavorites());
    await act(async () => {
      await result.current.syncToServer();
    });
    expect(mockSyncFavorites).toHaveBeenCalledWith([]);
  });

  it('syncToServer réussit sur un retry si le premier appel échoue', async () => {
    vi.useFakeTimers();
    mockSyncFavorites
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce([]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFavorites());
    await act(async () => {
      const p = result.current.syncToServer();
      await vi.runAllTimersAsync();
      await p;
    });

    expect(mockSyncFavorites).toHaveBeenCalledTimes(2); // 1 échec + 1 succès
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('syncToServer log une erreur et ne propage pas après épuisement des tentatives', async () => {
    vi.useFakeTimers();
    mockSyncFavorites.mockRejectedValue(new Error('Network failure'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFavorites());
    await act(async () => {
      const p = result.current.syncToServer();
      await vi.runAllTimersAsync();
      await p;
    });

    expect(mockSyncFavorites).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('syncToServer nettoie le localStorage des IDs invalides retournés par le serveur', async () => {
    localStorage.setItem('thermocook_favorites', JSON.stringify(['r1', 'r2', 'invalid_id']));
    // Le serveur ne retourne que les IDs valides
    mockSyncFavorites.mockResolvedValueOnce(['r1', 'r2']);

    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual(['r1', 'r2', 'invalid_id']);

    await act(async () => {
      await result.current.syncToServer();
    });

    expect(result.current.favorites).toEqual(['r1', 'r2']);
    const stored = JSON.parse(localStorage.getItem('thermocook_favorites') || '[]');
    expect(stored).toEqual(['r1', 'r2']);
  });

  it('persiste les favoris dans localStorage après toggle', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggleFavorite('rx');
    });
    const stored = JSON.parse(localStorage.getItem('thermocook_favorites') || '[]');
    expect(stored).toContain('rx');
  });
});
