import React from 'react';
import { AlertCircle } from 'lucide-react';

export const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-8 text-center">
    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
    <h3 className="text-lg font-bold text-gray-800">Oups ! Une erreur est survenue</h3>
    <p className="text-gray-500 text-sm mt-2">{message}</p>
  </div>
);
