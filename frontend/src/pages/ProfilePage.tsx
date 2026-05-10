import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Heart, ShieldAlert } from 'lucide-react';

interface ProfilePageProps {
  user: { id: number; username: string; is_admin?: boolean } | null;
  favoritesCount: number;
  onLogout: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, favoritesCount, onLogout }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/');
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-4">Vous n'êtes pas connecté.</p>
        <button
          onClick={() => navigate('/login')}
          className="px-8 py-3 bg-orange-500 text-white rounded-2xl font-bold shadow-sm"
        >
          Se connecter
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-md mx-auto">
      <div className="mb-8 text-center">
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={40} className="text-orange-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-900">{user.username}</h2>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-gray-600">
            <Heart size={18} className="text-orange-400" />
            <span className="text-sm font-medium">Recettes favorites</span>
          </div>
          <span className="font-black text-gray-900">{favoritesCount}</span>
        </div>
      </div>

      {user.is_admin && (
        <button
          onClick={() => navigate('/admin')}
          className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold shadow-sm hover:bg-orange-100 transition-colors mb-3"
        >
          <ShieldAlert size={18} />
          Tableau de bord admin
        </button>
      )}

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-red-50 text-red-600 rounded-2xl font-bold shadow-sm hover:bg-red-100 transition-colors"
      >
        <LogOut size={18} />
        Se déconnecter
      </button>
    </div>
  );
};
