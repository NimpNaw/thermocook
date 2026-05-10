import { renderHook, act } from '@testing-library/react';
import { useInfiniteScroll } from './useInfiniteScroll';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useInfiniteScroll', () => {
  const mockFetchData = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock IntersectionObserver correctly for class instantiation using function keyword
    window.IntersectionObserver = vi.fn().mockImplementation(function() {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });
  });

  it('initialise avec les valeurs par défaut', () => {
    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData }));
    
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it('charge les données initiales avec loadMore(true)', async () => {
    const mockData = [{ id: '1', title: 'Recette 1' }];
    mockFetchData.mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData, limit: 1 }));
    
    await act(async () => {
      await result.current.loadMore(true);
    });

    expect(mockFetchData).toHaveBeenCalledWith(0, 1);
    expect(result.current.data).toEqual(mockData);
    expect(result.current.hasMore).toBe(true); // car limit=1 et len=1
  });

  it('gère hasMore quand les données sont inférieures à la limite', async () => {
    const mockData = [{ id: '1', title: 'Recette 1' }];
    mockFetchData.mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData, limit: 10 }));
    
    await act(async () => {
      await result.current.loadMore(true);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('reset réinitialise l\'état', async () => {
    const mockData = [{ id: '1', title: 'Recette 1' }];
    mockFetchData.mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData, limit: 1 }));
    
    await act(async () => {
      await result.current.loadMore(true);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.hasMore).toBe(true);
  });
});
