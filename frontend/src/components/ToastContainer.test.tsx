// frontend/src/components/ToastContainer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import type { Toast } from '../hooks/useToast';

const toastSuccess: Toast = { id: 1, message: 'Recette ajoutée !', type: 'success' };
const toastError: Toast = { id: 2, message: 'Erreur réseau', type: 'error' };

describe('ToastContainer', () => {
  it('ne rend rien si la liste est vide', () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('affiche les messages des toasts', () => {
    render(<ToastContainer toasts={[toastSuccess, toastError]} onDismiss={() => {}} />);
    expect(screen.getByText('Recette ajoutée !')).toBeInTheDocument();
    expect(screen.getByText('Erreur réseau')).toBeInTheDocument();
  });

  it('appelle onDismiss avec l\'id du toast au clic sur la croix', () => {
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={[toastSuccess]} onDismiss={onDismiss} />);
    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('affiche autant de boutons qu\'il y a de toasts', () => {
    render(<ToastContainer toasts={[toastSuccess, toastError]} onDismiss={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
