// Bugs reproduits ici :
// 1. Double sonnerie/vibration à la fin du minuteur : l'effet unique dépendait
//    de [isTimerRunning, timerSeconds] ; setIsTimerRunning(false) dans la
//    branche « fin » redéclenchait l'effet qui re-vibrait et re-sonnait.
// 2. Son hébergé sur un CDN externe (mixkit.co) : silencieux hors-ligne — il
//    doit être un asset local précaché par le service worker.
// 3. Wake lock jamais réacquis après un passage en arrière-plan : l'écran
//    peut se reverrouiller en pleine cuisine.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookingMode } from './CookingMode';
import type { Recipe } from '../api';

vi.mock('../hooks/queries/useRecipeQueries', async () => {
  const actual = await vi.importActual<typeof import('../hooks/queries/useRecipeQueries')>(
    '../hooks/queries/useRecipeQueries'
  );
  return { ...actual, useRecipeQuery: vi.fn() };
});

import { useRecipeQuery } from '../hooks/queries/useRecipeQueries';

const recipe: Recipe = {
  id: 'r1',
  title: 'Tarte aux pommes',
  slug: 'tarte-aux-pommes',
  folder_name: 'cmix_cookomix/tarte-aux-pommes',
  steps_json: [
    { text: 'Cuire 1 min au Varoma.' },
    { text: 'Laisser refroidir.' },
  ],
};

function renderCookingMode() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/r1/cooking']}>
        <Routes>
          <Route path="/recipes/:id/cooking" element={<CookingMode />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CookingMode — fin de minuteur', () => {
  const playMock = vi.fn().mockResolvedValue(undefined);
  // function classique (pas une fléchée) : le composant l'appelle avec `new`
  const audioMock = vi.fn(function () {
    return { play: playMock };
  });
  const vibrateMock = vi.fn();

  beforeEach(() => {
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: recipe,
      isLoading: false,
      isError: false,
    } as any);
    playMock.mockClear();
    audioMock.mockClear();
    vibrateMock.mockClear();
    vi.stubGlobal('Audio', audioMock);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ne vibre et ne sonne qu\'UNE seule fois à la fin du minuteur', () => {
    renderCookingMode();

    fireEvent.click(screen.getByRole('button', { name: /1 min/i }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(vibrateMock).toHaveBeenCalledTimes(1);
    expect(audioMock).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('joue un son local précaché (pas un CDN externe)', () => {
    renderCookingMode();

    fireEvent.click(screen.getByRole('button', { name: /1 min/i }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const src = audioMock.mock.calls[0][0] as unknown as string;
    expect(src).toMatch(/^\/sounds\//);
  });

  it("passe automatiquement à l'étape suivante après la sonnerie", () => {
    renderCookingMode();

    fireEvent.click(screen.getByRole('button', { name: /1 min/i }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(screen.getByText('Laisser refroidir.')).toBeInTheDocument();
  });
});

describe('CookingMode — wake lock', () => {
  const releaseMock = vi.fn().mockResolvedValue(undefined);
  const requestMock = vi.fn().mockResolvedValue({ release: releaseMock });

  beforeEach(() => {
    vi.mocked(useRecipeQuery).mockReturnValue({
      data: recipe,
      isLoading: false,
      isError: false,
    } as any);
    requestMock.mockClear();
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestMock },
      configurable: true,
    });
  });

  it("réacquiert le verrou d'écran quand l'app redevient visible", async () => {
    renderCookingMode();
    await act(async () => {});
    expect(requestMock).toHaveBeenCalledTimes(1);

    // Passage en arrière-plan (le navigateur relâche le verrou tout seul)…
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    fireEvent(document, new Event('visibilitychange'));
    // …puis retour au premier plan : le verrou doit être redemandé
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });

    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});
