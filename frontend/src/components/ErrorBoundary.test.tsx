// frontend/src/components/ErrorBoundary.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Composant qui peut lancer une erreur à la demande
const Bomb: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) throw new Error('Explosion de test');
  return <div>Contenu normal</div>;
};

describe('ErrorBoundary', () => {
  // Supprime les erreurs console React attendues dans ces tests
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('affiche les enfants quand tout va bien', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Contenu normal')).toBeInTheDocument();
  });

  it('affiche le fallback quand un enfant lance une erreur', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Une erreur inattendue s'est produite")).toBeInTheDocument();
  });

  it('affiche le message d\'erreur dans le fallback', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Explosion de test')).toBeInTheDocument();
  });

  it('affiche le bouton "Retour à l\'accueil" dans le fallback', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /retour à l'accueil/i })).toBeInTheDocument();
  });

  it('redirige vers / au clic sur "Retour à l\'accueil"', () => {
    const mockLocation = { href: '' };
    vi.stubGlobal('location', mockLocation);

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /retour à l'accueil/i }));
    expect(mockLocation.href).toBe('/');

    vi.unstubAllGlobals();
  });
});
