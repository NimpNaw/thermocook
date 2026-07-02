import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './useSearchStore';

describe('useSearchStore', () => {
  beforeEach(() => {
    // Le store zustand est un singleton : on remet l'état à zéro entre les tests.
    useSearchStore.setState({ searchQuery: '' });
  });

  it('démarre avec une recherche vide', () => {
    expect(useSearchStore.getState().searchQuery).toBe('');
  });

  it('setSearchQuery met à jour la recherche', () => {
    useSearchStore.getState().setSearchQuery('tarte aux pommes');
    expect(useSearchStore.getState().searchQuery).toBe('tarte aux pommes');
  });

  it('setSearchQuery écrase la valeur précédente', () => {
    useSearchStore.getState().setSearchQuery('tarte');
    useSearchStore.getState().setSearchQuery('soupe');
    expect(useSearchStore.getState().searchQuery).toBe('soupe');
  });

  it('clearSearch remet la recherche à vide', () => {
    useSearchStore.getState().setSearchQuery('tarte');
    useSearchStore.getState().clearSearch();
    expect(useSearchStore.getState().searchQuery).toBe('');
  });

  it('notifie les abonnés lors d\'un changement', () => {
    let notified = '';
    const unsubscribe = useSearchStore.subscribe((state) => {
      notified = state.searchQuery;
    });
    useSearchStore.getState().setSearchQuery('gratin');
    unsubscribe();
    expect(notified).toBe('gratin');
  });
});
