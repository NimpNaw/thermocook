import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions<T> {
  fetchData: (offset: number, limit: number) => Promise<T[]>;
  limit?: number;
  initialData?: T[];
}

export function useInfiniteScroll<T>({
  fetchData,
  limit = 40,
  initialData = []
}: UseInfiniteScrollOptions<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(initialData.length);
  const [error, setError] = useState<Error | null>(null);

  // Sentinel ref for the bottom observer
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async (isInitial = false) => {
    if (loading || (!hasMore && !isInitial)) return;

    setLoading(true);
    setError(null);

    try {
      const currentOffset = isInitial ? 0 : offset;
      const newData = await fetchData(currentOffset, limit);
      
      if (isInitial) {
        setData(newData);
        setOffset(newData.length);
      } else {
        setData(prev => [...prev, ...newData]);
        setOffset(prev => prev + newData.length);
      }

      setHasMore(newData.length === limit);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [fetchData, limit, loading, hasMore, offset]);

  // Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentSentinel = bottomSentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, loading, loadMore]);

  const reset = useCallback(() => {
    setData([]);
    setOffset(0);
    setHasMore(true);
    setLoading(false);
    // Trigger initial load
    // loadMore(true); // Will be called by useEffect if sentinel is visible or manually
  }, []);

  return {
    data,
    loading,
    hasMore,
    error,
    bottomSentinelRef,
    loadMore,
    reset,
    setData
  };
}
