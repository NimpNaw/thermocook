import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retourne la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useDebounce('tarte', 300));
    expect(result.current).toBe('tarte');
  });

  it('ne propage pas la nouvelle valeur avant le délai', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'tarte' },
    });

    rerender({ value: 'tarte aux pommes' });

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('tarte');
  });

  it('propage la nouvelle valeur après le délai', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'tarte' },
    });

    rerender({ value: 'tarte aux pommes' });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('tarte aux pommes');
  });

  it('annule le timer précédent si la valeur change avant le délai (anti-rebond)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 400ms écoulées au total, mais seulement 200ms depuis la dernière frappe :
    // la valeur intermédiaire 'ab' ne doit jamais apparaître.
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('abc');
  });

  it('nettoie le timer au démontage (pas de mise à jour après unmount)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
