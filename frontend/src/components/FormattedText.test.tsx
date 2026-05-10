// frontend/src/components/FormattedText.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormattedText } from './FormattedText';

describe('FormattedText', () => {
  it('retourne null pour un texte vide', () => {
    const { container } = render(<FormattedText text="" />);
    expect(container.firstChild).toBeNull();
  });

  it('affiche un titre h4 pour les lignes commençant par ###', () => {
    render(<FormattedText text="### Étape de finition" />);
    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Étape de finition');
  });

  // ── Blocs {réglage Thermomix} ─────────────────────────────────────────────

  it('affiche un bloc {} avec fond teal', () => {
    const { container } = render(<FormattedText text="{3 min/Varoma/vitesse 1}" />);
    const block = container.querySelector('.bg-teal-50');
    expect(block).toBeInTheDocument();
  });

  it('rend la durée dans un bloc {} comme bouton timer si onTimerClick fourni', () => {
    const onTimerClick = vi.fn();
    render(<FormattedText text="{3 min/Varoma/vitesse 1}" onTimerClick={onTimerClick} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('3 min');
    fireEvent.click(btn);
    expect(onTimerClick).toHaveBeenCalledWith(180);
  });

  it('rend un mot-clé de mode dans {} comme icône culinary', () => {
    const { container } = render(<FormattedText text="{5 min/pétrin}" />);
    const icon = container.querySelector('.culinary-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', 'pétrin');
  });

  it('rend Varoma dans {} comme icône culinary', () => {
    const { container } = render(<FormattedText text="{3 min/Varoma/vitesse 1}" />);
    const icon = container.querySelector('.culinary-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', 'Varoma');
  });

  it('rend la vitesse dans {} comme texte brut', () => {
    render(<FormattedText text="{3 min/Varoma/vitesse 1}" />);
    expect(screen.getByText('vitesse 1')).toBeInTheDocument();
  });

  it('rend les secondes dans {} ({30 sec/turbo})', () => {
    const onTimerClick = vi.fn();
    render(<FormattedText text="{30 sec/turbo}" onTimerClick={onTimerClick} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onTimerClick).toHaveBeenCalledWith(30);
  });

  it('affiche le texte autour d\'un bloc {} normalement', () => {
    render(<FormattedText text="Cuire les légumes {20 min/Varoma/vitesse 1} puis égoutter." />);
    expect(screen.getByText(/Cuire les légumes/)).toBeInTheDocument();
    expect(screen.getByText(/puis égoutter/)).toBeInTheDocument();
  });

  it('ne crée pas de bouton timer dans {} si onTimerClick absent', () => {
    render(<FormattedText text="{5 min/pétrin}" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('5 min')).toBeInTheDocument();
  });

  it('rend un mode spécial TM6 [TAG] dans {} comme icône culinary ([THICKEN])', () => {
    const { container } = render(<FormattedText text="{[THICKEN]/100°C}" />);
    const icon = container.querySelector('.culinary-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', '[THICKEN]');
  });

  it('rend un mode spécial TM6 [TAG] dans {} comme icône culinary ([BLEND])', () => {
    const { container } = render(<FormattedText text="{30 sec/[BLEND]}" />);
    const icon = container.querySelector('.culinary-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', '[BLEND]');
  });

  it('rend un tag symbolique [SYM_XXXX] dans {} comme icône culinary', () => {
    const { container } = render(<FormattedText text="{2 min/[SYM_E037]}" />);
    const icon = container.querySelector('.culinary-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', '[SYM_E037]');
  });

  it('rend un tag inconnu dans {} comme texte brut', () => {
    render(<FormattedText text="{[UNKNOWN_SPECIAL]}" />);
    expect(screen.getByText('[UNKNOWN_SPECIAL]')).toBeInTheDocument();
  });

  // ── Tags legacy [TAG] (compat données existantes) ─────────────────────────

  it('affiche une icône pour un tag connu ([KNEAD])', () => {
    const { container } = render(<FormattedText text="[KNEAD]" />);
    const icon = container.querySelector('.culinary-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', '[KNEAD]');
  });

  it('affiche le tag brut pour un tag inconnu', () => {
    render(<FormattedText text="[UNKNOWN_TAG]" />);
    expect(screen.getByText('[UNKNOWN_TAG]')).toBeInTheDocument();
  });

  it('affiche un [TIMER:N] legacy comme bouton avec la durée formatée', () => {
    const onTimerClick = vi.fn();
    render(<FormattedText text="[TIMER:600]" onTimerClick={onTimerClick} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('10 min');
  });

  // ── Timers inline dans texte brut ─────────────────────────────────────────

  it('détecte "20 min" et affiche un bouton timer si onTimerClick fourni', () => {
    const onTimerClick = vi.fn();
    render(<FormattedText text="Cuire 20 min à feu doux" onTimerClick={onTimerClick} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('20 min');
  });

  it('appelle onTimerClick avec les bonnes secondes au clic', () => {
    const onTimerClick = vi.fn();
    render(<FormattedText text="Cuire 20 min" onTimerClick={onTimerClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onTimerClick).toHaveBeenCalledWith(1200);
  });

  it('ne crée pas de bouton timer si onTimerClick est absent', () => {
    render(<FormattedText text="Cuire 20 min" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('détecte les secondes seules ("30 sec") comme timer', () => {
    const onTimerClick = vi.fn();
    render(<FormattedText text="Attendre 30 sec" onTimerClick={onTimerClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onTimerClick).toHaveBeenCalledWith(30);
  });

  // ── Images ────────────────────────────────────────────────────────────────

  it('affiche une image Markdown avec folder', () => {
    render(<FormattedText text="![photo](step1.jpg)" folder="ma-recette_42" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/assets/ma-recette_42/step1.jpg');
    expect(img).toHaveAttribute('alt', 'photo');
  });

  it('masque l\'image Markdown en cas d\'erreur de chargement', () => {
    render(<FormattedText text="![photo](broken.jpg)" folder="test_42" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(img).toHaveStyle('display: none');
  });
});
