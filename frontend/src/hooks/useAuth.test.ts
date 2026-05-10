import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuth } from './useAuth';

vi.mock('../api', () => ({
  api: {
    getCurrentUser: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

import { api } from '../api';

const mockGetCurrentUser = api.getCurrentUser as ReturnType<typeof vi.fn>;
const mockLogout = api.logout as ReturnType<typeof vi.fn>;

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loading=false et user=null si getCurrentUser échoue (pas de session)', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('401'));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('charge l\'utilisateur au montage si session valide', async () => {
    const fakeUser = { id: 1, username: 'alice', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockGetCurrentUser.mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toEqual(fakeUser);
  });

  it('user=null si getCurrentUser échoue (session expirée)', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
  });

  it('logout appelle api.logout et vide user', async () => {
    const fakeUser = { id: 1, username: 'alice', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockGetCurrentUser.mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).toEqual(fakeUser));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockLogout).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it('logout déclenché par l\'événement thermocook:unauthorized', async () => {
    const fakeUser = { id: 1, username: 'alice', is_active: true, is_admin: false, created_at: '2024-01-01' };
    mockGetCurrentUser.mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).toEqual(fakeUser));

    act(() => {
      window.dispatchEvent(new CustomEvent('thermocook:unauthorized'));
    });

    await waitFor(() => expect(result.current.user).toBeNull());
  });
});
