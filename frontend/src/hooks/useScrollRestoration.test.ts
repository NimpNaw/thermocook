import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollRestoration } from './useScrollRestoration';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useLocation: () => ({ key: 'test-key', pathname: '/' }) };
});

describe('useScrollRestoration', () => {
  let mainEl: HTMLElement;

  beforeEach(() => {
    mainEl = document.createElement('main');
    document.body.appendChild(mainEl);
    sessionStorage.clear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  });

  afterEach(() => {
    document.body.removeChild(mainEl);
    vi.restoreAllMocks();
  });

  it('restaure le scrollTop depuis sessionStorage au montage', () => {
    sessionStorage.setItem('scroll:test-key', '500');
    Object.defineProperty(mainEl, 'scrollTop', { value: 0, writable: true, configurable: true });

    renderHook(() => useScrollRestoration());

    expect(mainEl.scrollTop).toBe(500);
  });

  it('ne modifie pas le scroll si rien de sauvegardé', () => {
    Object.defineProperty(mainEl, 'scrollTop', { value: 0, writable: true, configurable: true });

    renderHook(() => useScrollRestoration());

    expect(mainEl.scrollTop).toBe(0);
  });

  it('sauvegarde le scrollTop dans sessionStorage au démontage', () => {
    Object.defineProperty(mainEl, 'scrollTop', { value: 350, writable: true, configurable: true });

    const { unmount } = renderHook(() => useScrollRestoration());
    unmount();

    expect(sessionStorage.getItem('scroll:test-key')).toBe('350');
  });

  it('inclut le suffix dans la clé', () => {
    Object.defineProperty(mainEl, 'scrollTop', { value: 200, writable: true, configurable: true });

    const { unmount } = renderHook(() => useScrollRestoration('search:poulet'));
    unmount();

    expect(sessionStorage.getItem('scroll:test-key:search:poulet')).toBe('200');
  });

  it('restaure avec suffix', () => {
    sessionStorage.setItem('scroll:test-key:search:poulet', '300');
    Object.defineProperty(mainEl, 'scrollTop', { value: 0, writable: true, configurable: true });

    renderHook(() => useScrollRestoration('search:poulet'));

    expect(mainEl.scrollTop).toBe(300);
  });

  it('ne sauvegarde pas pendant la restauration (cas StrictMode)', () => {
    // Simule le cas StrictMode : cleanup s'exécute avant que le rAF ait restauré le scroll.
    // rAF asynchrone pour simuler le comportement navigateur réel.
    vi.restoreAllMocks(); // annule le mock rAF synchrone
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb; // capture le callback sans l'exécuter
      return 0;
    });

    sessionStorage.setItem('scroll:test-key', '800');
    Object.defineProperty(mainEl, 'scrollTop', { value: 0, writable: true, configurable: true });

    const { unmount } = renderHook(() => useScrollRestoration());
    // rAF n'a pas encore tiré (restauration en cours)
    // cleanup ici = StrictMode fake unmount avant que le scroll soit restauré
    unmount();

    // La valeur "800" doit être préservée (pas écrasée par le scrollTop=0 actuel)
    expect(sessionStorage.getItem('scroll:test-key')).toBe('800');
    rafCallback = null;
  });

  it('ne restaure pas ni sauvegarde quand enabled est false', () => {
    sessionStorage.setItem('scroll:test-key', '500');
    Object.defineProperty(mainEl, 'scrollTop', { value: 200, writable: true, configurable: true });

    const { unmount } = renderHook(() => useScrollRestoration(undefined, { enabled: false }));
    unmount();

    expect(mainEl.scrollTop).toBe(200); // pas restauré
    expect(sessionStorage.getItem('scroll:test-key')).toBe('500'); // pas écrasé
  });
});
