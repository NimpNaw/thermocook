import { renderHook, act } from '@testing-library/react';
import { useInfiniteScroll } from './useInfiniteScroll';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useInfiniteScroll', () => {
  const mockFetchData = vi.fn();
  let observerCallbacks: ((entries: { isIntersecting: boolean }[]) => void)[];

  beforeEach(() => {
    vi.clearAllMocks();
    observerCallbacks = [];
    // Mock IntersectionObserver correctly for class instantiation using function keyword
    window.IntersectionObserver = vi.fn().mockImplementation(function(
      callback: (entries: { isIntersecting: boolean }[]) => void
    ) {
      observerCallbacks.push(callback);
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

  it('concatène les pages suivantes et avance l\'offset', async () => {
    const page1 = [{ id: '1' }, { id: '2' }];
    const page2 = [{ id: '3' }, { id: '4' }];
    mockFetchData.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData, limit: 2 }));

    await act(async () => {
      await result.current.loadMore(true);
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockFetchData).toHaveBeenNthCalledWith(1, 0, 2);
    expect(mockFetchData).toHaveBeenNthCalledWith(2, 2, 2);
    expect(result.current.data).toEqual([...page1, ...page2]);
  });

  it('ne recharge pas quand hasMore est false (hors chargement initial)', async () => {
    mockFetchData.mockResolvedValueOnce([{ id: '1' }]); // page incomplète (limit=10)

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData, limit: 10 }));

    await act(async () => {
      await result.current.loadMore(true);
    });
    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockFetchData).toHaveBeenCalledTimes(1);
  });

  it('expose l\'erreur si fetchData échoue', async () => {
    mockFetchData.mockRejectedValueOnce(new Error('réseau indisponible'));

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData }));

    await act(async () => {
      await result.current.loadMore(true);
    });

    expect(result.current.error?.message).toBe('réseau indisponible');
    expect(result.current.loading).toBe(false);
  });

  it('enrobe les rejets non-Error dans une Error générique', async () => {
    mockFetchData.mockRejectedValueOnce('boom');

    const { result } = renderHook(() => useInfiniteScroll({ fetchData: mockFetchData }));

    await act(async () => {
      await result.current.loadMore(true);
    });

    expect(result.current.error?.message).toBe('Unknown error');
  });

  it('initialise data et offset à partir de initialData', () => {
    const initialData = [{ id: '1' }, { id: '2' }];
    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchData: mockFetchData, initialData })
    );

    expect(result.current.data).toEqual(initialData);
  });

  it('déclenche loadMore quand la sentinelle intersecte', async () => {
    mockFetchData.mockResolvedValue([]);

    renderHook(() => useInfiniteScroll({ fetchData: mockFetchData, limit: 5 }));

    await act(async () => {
      observerCallbacks.forEach(cb => cb([{ isIntersecting: true }]));
    });

    expect(mockFetchData).toHaveBeenCalledWith(0, 5);
  });

  it('ne déclenche pas loadMore si la sentinelle n\'intersecte pas', async () => {
    renderHook(() => useInfiniteScroll({ fetchData: mockFetchData }));

    await act(async () => {
      observerCallbacks.forEach(cb => cb([{ isIntersecting: false }]));
    });

    expect(mockFetchData).not.toHaveBeenCalled();
  });
});
