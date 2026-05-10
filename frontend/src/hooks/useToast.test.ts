// frontend/src/hooks/useToast.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('démarre avec une liste vide', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('ajoute un toast via showToast', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Erreur réseau', 'error');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Erreur réseau');
    expect(result.current.toasts[0].type).toBe('error');
  });

  it('type par défaut est "error"', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('oups');
    });
    expect(result.current.toasts[0].type).toBe('error');
  });

  it('ajoute un toast success', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Sauvegardé', 'success');
    });
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('retire le toast après 4000ms', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('temporaire');
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismissToast retire le toast immédiatement', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('message');
    });
    const id = result.current.toasts[0].id;
    act(() => {
      result.current.dismissToast(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('chaque toast a un ID unique', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('premier');
      result.current.showToast('second');
    });
    const ids = result.current.toasts.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
