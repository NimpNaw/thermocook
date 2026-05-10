// frontend/src/context/ToastContext.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToastContext } from './ToastContext';

const ShowToastConsumer = () => {
  const showToast = useToastContext();
  return <button onClick={() => showToast('clic', 'success')}>fire</button>;
};

describe('ToastContext', () => {
  it('useToastContext retourne la fonction no-op par défaut', () => {
    // Sans provider, la valeur par défaut est () => {}
    let captured: Function | undefined;
    const Consumer = () => {
      captured = useToastContext();
      return null;
    };
    render(<Consumer />);
    expect(typeof captured).toBe('function');
    expect(() => captured!('test')).not.toThrow();
  });

  it('ToastProvider transmet showToast au consumer', () => {
    const mockShowToast = vi.fn();
    render(
      <ToastProvider showToast={mockShowToast}>
        <ShowToastConsumer />
      </ToastProvider>
    );
    screen.getByText('fire').click();
    expect(mockShowToast).toHaveBeenCalledWith('clic', 'success');
  });

  it('ToastProvider rend ses enfants', () => {
    render(
      <ToastProvider showToast={() => {}}>
        <span>contenu enfant</span>
      </ToastProvider>
    );
    expect(screen.getByText('contenu enfant')).toBeTruthy();
  });
});
