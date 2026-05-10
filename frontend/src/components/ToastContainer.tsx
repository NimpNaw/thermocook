import React from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Toast } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[90vw] max-w-sm pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-auto animate-fade-in
            ${toast.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-green-600 text-white'
            }`}
        >
          {toast.type === 'error'
            ? <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            : <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
          }
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} className="flex-shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
