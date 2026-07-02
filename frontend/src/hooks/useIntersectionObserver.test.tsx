import React from 'react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, act } from '@testing-library/react';
import { useIntersectionObserver } from './useIntersectionObserver';

// Mock d'IntersectionObserver : chaque instance suit son état (observée ou
// non) pour ne déclencher — comme un vrai navigateur — que les observers
// encore actifs (pas ceux dont la cible a été unobserve/disconnect).
type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

interface MockObserver {
  callback: ObserverCallback;
  active: boolean;
  options?: IntersectionObserverInit;
}

let observers: MockObserver[];
const realIntersectionObserver = window.IntersectionObserver;

afterAll(() => {
  window.IntersectionObserver = realIntersectionObserver;
});

beforeEach(() => {
  observers = [];

  window.IntersectionObserver = vi.fn().mockImplementation(function (
    callback: ObserverCallback,
    options?: IntersectionObserverInit
  ) {
    const instance: MockObserver = { callback, active: false, options };
    observers.push(instance);
    return {
      observe: vi.fn(() => { instance.active = true; }),
      unobserve: vi.fn(() => { instance.active = false; }),
      disconnect: vi.fn(() => { instance.active = false; }),
    };
  }) as unknown as typeof IntersectionObserver;
});

// Composant hôte : le hook a besoin d'un élément DOM réel attaché à sentinelRef.
const Sentinel: React.FC<{
  onIntersect: () => void;
  enabled?: boolean;
  threshold?: number;
  rootMargin?: string;
}> = (props) => {
  const { sentinelRef } = useIntersectionObserver(props);
  return <div ref={sentinelRef} data-testid="sentinel" />;
};

function intersect(isIntersecting: boolean) {
  act(() => {
    observers
      .filter((o) => o.active)
      .forEach((o) => o.callback([{ isIntersecting }]));
  });
}

describe('useIntersectionObserver', () => {
  it('observe la sentinelle quand enabled', () => {
    render(<Sentinel onIntersect={() => {}} />);
    expect(observers.filter((o) => o.active)).toHaveLength(1);
  });

  it('déclenche onIntersect quand la sentinelle devient visible', () => {
    const onIntersect = vi.fn();
    render(<Sentinel onIntersect={onIntersect} />);

    intersect(true);

    expect(onIntersect).toHaveBeenCalledOnce();
  });

  it('ne déclenche pas onIntersect si l\'entrée n\'intersecte pas', () => {
    const onIntersect = vi.fn();
    render(<Sentinel onIntersect={onIntersect} />);

    intersect(false);

    expect(onIntersect).not.toHaveBeenCalled();
  });

  it('ne crée pas d\'observer quand enabled=false', () => {
    const onIntersect = vi.fn();
    render(<Sentinel onIntersect={onIntersect} enabled={false} />);

    expect(window.IntersectionObserver).not.toHaveBeenCalled();
    expect(onIntersect).not.toHaveBeenCalled();
  });

  it('cesse de déclencher quand enabled passe à false', () => {
    const onIntersect = vi.fn();
    const { rerender } = render(<Sentinel onIntersect={onIntersect} enabled={true} />);

    rerender(<Sentinel onIntersect={onIntersect} enabled={false} />);
    intersect(true);

    expect(onIntersect).not.toHaveBeenCalled();
  });

  it('transmet threshold et rootMargin à l\'observer', () => {
    render(<Sentinel onIntersect={() => {}} threshold={0.5} rootMargin="100px" />);
    expect(observers[0].options).toEqual({ threshold: 0.5, rootMargin: '100px' });
  });

  it('arrête d\'observer la sentinelle au démontage', () => {
    const onIntersect = vi.fn();
    const { unmount } = render(<Sentinel onIntersect={onIntersect} />);

    unmount();

    expect(observers.filter((o) => o.active)).toHaveLength(0);
    intersect(true);
    expect(onIntersect).not.toHaveBeenCalled();
  });
});
