import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Lock, User as UserIcon, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../api';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegister) {
        await api.register(formData);
        await api.login(formData.username, formData.password);
      } else {
        await api.login(formData.username, formData.password);
      }
      onLoginSuccess();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#006d5b] text-white rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <ChefHat size={32} />
          </div>
          <h2 className="text-2xl font-black text-gray-900">
            {isRegister ? 'Créer un compte' : 'Bon retour !'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {isRegister ? 'Rejoignez la communauté ThermoCook' : 'Prêt à cuisiner ? Connectez-vous'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Nom d'utilisateur" 
              required
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#006d5b] transition-all outline-none"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="password" 
              placeholder="Mot de passe" 
              required
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#006d5b] transition-all outline-none"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          {error && <div className="text-red-500 text-xs font-bold px-2">{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-[#006d5b] text-white rounded-2xl font-black shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : (
              <>
                {isRegister ? "S'inscrire" : "Se connecter"} <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors"
          >
            {isRegister ? 'Déjà un compte ? Se connecter' : "Pas encore de compte ? S'inscrire"}
          </button>
        </div>
      </div>
    </div>
  );
};
