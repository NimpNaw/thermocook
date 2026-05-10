import React from 'react';
import { Search, UserCircle, ChefHat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../api';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onNavigate?: () => void;
  user: User | null;
}

export const Header: React.FC<HeaderProps> = ({ searchQuery, setSearchQuery, onSearch, onNavigate, user }) => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    onNavigate?.();
    navigate(path);
  };

  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 p-4 border-b border-gray-100">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleNavigate('/')}>
            <div className="w-8 h-8 bg-[#006d5b] text-white rounded-lg flex items-center justify-center">
              <ChefHat size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tighter text-gray-900">THERMOCOOK</h1>
          </div>
          <button
            onClick={() => handleNavigate(user ? '/profile' : '/login')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${user ? 'bg-orange-50 border-orange-100 text-orange-700' : 'bg-white border-gray-200 text-gray-400 hover:text-[#006d5b]'}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">{user ? user.username : 'Connexion'}</span>
            <UserCircle size={20} />
          </button>
        </div>

        <form onSubmit={onSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="search"
              placeholder="Envie de cuisiner quoi ?"
              className="w-full pl-12 pr-4 py-3 bg-gray-100 border-none rounded-2xl focus:ring-2 focus:ring-[#006d5b] transition-all outline-none text-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="p-3 bg-[#006d5b] text-white rounded-2xl shadow-sm hover:bg-[#005a4b] transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
        </form>
      </div>
    </header>
  );
};
