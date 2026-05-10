import { describe, it, expect } from 'vitest';
import { formatTime, splitIngredient, cleanIngredient } from './formatters';

describe('formatTime', () => {
  it('retourne "0 min" pour 0 secondes', () => {
    expect(formatTime(0)).toBe('0 min');
  });

  it('retourne les minutes seules sous 1h', () => {
    expect(formatTime(1800)).toBe('30 min');
  });

  it('retourne les heures seules quand les minutes sont à 0', () => {
    expect(formatTime(3600)).toBe('1h');
  });

  it('retourne heures + minutes avec padding', () => {
    expect(formatTime(5400)).toBe('1h30');
  });

  it('retourne heures + minutes avec padding à deux chiffres', () => {
    expect(formatTime(3660)).toBe('1h01');
  });
});

describe('cleanIngredient', () => {
  it('supprime le mot QS', () => {
    expect(cleanIngredient('sel QS')).toBe('sel');
  });

  it('normalise les espaces multiples', () => {
    expect(cleanIngredient('beurre   fondu')).toBe('beurre fondu');
  });

  it('supprime QS en milieu de phrase et normalise', () => {
    expect(cleanIngredient('huile QS finement')).toBe('huile finement');
  });

  it('ne touche pas un texte sans QS', () => {
    expect(cleanIngredient('farine de blé')).toBe('farine de blé');
  });

  it('supprime le préfixe unité orphelin sans chiffre : "g de beurre"', () => {
    expect(cleanIngredient('g de beurre')).toBe('beurre');
  });

  it('supprime le préfixe unité orphelin avec apostrophe : "g d\'oignon"', () => {
    expect(cleanIngredient("g d'oignon")).toBe('oignon');
  });

  it('ne touche pas une quantité avec chiffre : "250 g de beurre"', () => {
    expect(cleanIngredient('250 g de beurre')).toBe('250 g de beurre');
  });

  it('ne supprime pas les unités de comptage sans chiffre : "pincée de sel"', () => {
    expect(cleanIngredient('pincée de sel')).toBe('pincée de sel');
  });
});

describe('splitIngredient', () => {
  it('retourne main sans precision si pas de parenthèse', () => {
    expect(splitIngredient('oignon')).toEqual({ main: 'oignon', precision: null });
  });

  it('extrait la precision entre parenthèses', () => {
    expect(splitIngredient('oignon (coupé en deux)')).toEqual({
      main: 'oignon',
      precision: 'coupé en deux',
    });
  });

  it('gère les parenthèses imbriquées', () => {
    expect(splitIngredient('beurre (ramolli (température ambiante))')).toEqual({
      main: 'beurre',
      precision: 'ramolli (température ambiante)',
    });
  });

  it('retourne le texte brut si la parenthèse n\'est pas fermée', () => {
    expect(splitIngredient('oignon (')).toEqual({ main: 'oignon (', precision: null });
  });

  it('retourne le texte original si main est vide', () => {
    expect(splitIngredient('(sans gluten)')).toEqual({ main: '(sans gluten)', precision: 'sans gluten' });
  });

  it('retourne null pour precision si les parenthèses sont vides', () => {
    expect(splitIngredient('oignon ()')).toEqual({ main: 'oignon', precision: null });
  });
});
