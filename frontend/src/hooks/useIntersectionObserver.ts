import { useEffect, useRef, useCallback } from 'react';

interface UseIntersectionObserverOptions {
  onIntersect: () => void;
  enabled?: boolean;
  threshold?: number;
  rootMargin?: string;
}

export function useIntersectionObserver({
  onIntersect,
  enabled = true,
  threshold = 0.1,
  rootMargin = '0px',
}: UseIntersectionObserverOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const internalOnIntersect = useCallback(() => {
    if (enabled) {
      onIntersect();
    }
  }, [enabled, onIntersect]);

  useEffect(() => {
    const currentSentinel = sentinelRef.current;
    if (!currentSentinel || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          internalOnIntersect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(currentSentinel);

    return () => {
      observer.unobserve(currentSentinel);
    };
  }, [enabled, threshold, rootMargin, internalOnIntersect]);

  return { sentinelRef };
}
