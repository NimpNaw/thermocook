import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChefHat, Book, Heart, ShoppingCart } from 'lucide-react';
import { User } from '../../api';

interface BottomNavProps {
  onNavClick: () => void;
  user: User | null;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onNavClick, user }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path: string) => {
    onNavClick();
    if (location.pathname === path) {
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  // Une recette/cuisine consultée depuis le catalogue garde "Catalogue" actif.
  const activePath = location.pathname.startsWith('/recipes/')
    ? '/recipes'
    : location.pathname;

  const itemClass = (path: string) =>
    `flex flex-col items-center gap-1 transition-colors ${
      activePath === path ? 'text-[#006d5b]' : 'text-gray-400 hover:text-[#006d5b]'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-100 pt-3 pb-3 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="max-w-lg mx-auto px-6 flex justify-between items-center">
        <button
          onClick={() => handleNav('/')}
          aria-current={activePath === '/' ? 'page' : undefined}
          className={itemClass('/')}
        >
          <ChefHat className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Découvrir</span>
        </button>
        <button
          onClick={() => handleNav('/recipes')}
          aria-current={activePath === '/recipes' ? 'page' : undefined}
          className={itemClass('/recipes')}
        >
          <Book className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Catalogue</span>
        </button>
        {user && (
          <button
            onClick={() => handleNav('/shopping-list')}
            aria-current={activePath === '/shopping-list' ? 'page' : undefined}
            className={itemClass('/shopping-list')}
          >
            <ShoppingCart className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Courses</span>
          </button>
        )}
        {user && (
          <button
            onClick={() => handleNav('/favorites')}
            aria-current={activePath === '/favorites' ? 'page' : undefined}
            className={itemClass('/favorites')}
          >
            <Heart className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Favoris</span>
          </button>
        )}
      </div>
    </nav>
  );
};
