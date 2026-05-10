import React, { createContext, useContext } from 'react';

type ShowToast = (message: string, type?: 'error' | 'success') => void;

export const ToastContext = createContext<ShowToast>(() => {});

export const useToastContext = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ showToast: ShowToast; children: React.ReactNode }> = ({ showToast, children }) => (
  <ToastContext.Provider value={showToast}>{children}</ToastContext.Provider>
);
