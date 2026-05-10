import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Une erreur inattendue s'est produite</h1>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            {this.state.error?.message || 'Erreur inconnue'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            className="px-6 py-3 bg-[#006d5b] text-white rounded-2xl font-bold text-sm hover:bg-[#005a4b] transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
