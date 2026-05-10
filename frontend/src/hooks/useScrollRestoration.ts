import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface ScrollRestorationOptions {
  enabled?: boolean;
}

// Cache module-level : survit aux double-invokes de StrictMode et aux démontages
const scrollCache = new Map<string, number>();

export function useScrollRestoration(suffix?: string, options?: ScrollRestorationOptions) {
  const { key } = useLocation();
  const enabled = options?.enabled ?? true;
  const storageKey = suffix ? `scroll:${key}:${suffix}` : `scroll:${key}`;

  // Sauvegarde AVANT les mutations DOM (useLayoutEffect cleanup = synchrone,
  // avant que le navigateur ne clamp scrollTop lors du changement de contenu)
  useLayoutEffect(() => {
    if (!enabled) return;
    const saved = sessionStorage.getItem(storageKey);
    scrollCache.set(storageKey, saved ? parseInt(saved, 10) : 0);
    return () => {
      sessionStorage.setItem(storageKey, String(scrollCache.get(storageKey) ?? 0));
    };
  }, [storageKey, enabled]);

  // Tracking en temps réel + restauration après paint (contenu disponible)
  useEffect(() => {
    if (!enabled) return;
    const el = document.querySelector('main') as HTMLElement | null;
    if (!el) return;

    // Cas test : scrollTop déjà non-nul au montage (jsdom ne fire pas d'events)
    if (el.scrollTop > 0) {
      scrollCache.set(storageKey, el.scrollTop);
    }

    const onScroll = () => {
      scrollCache.set(storageKey, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    const target = scrollCache.get(storageKey) ?? 0;
    if (target > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = target;
        });
      });
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [storageKey, enabled]);
}
