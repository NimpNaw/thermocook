import React from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useSearchStore } from '../../store/useSearchStore';
import { User } from '../../api';

interface MainLayoutProps {
  children: React.ReactNode;
  onSearch: (e: React.FormEvent) => void;
  user: User | null;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, onSearch, user }) => {
  const location = useLocation();
  const { searchQuery, setSearchQuery, clearSearch } = useSearchStore();

  const isCookingMode = location.pathname.endsWith('/cooking');
  const isRecipeDetail = location.pathname.startsWith('/recipes/') && !isCookingMode;
  const isLogin = location.pathname === '/login';
  const isShoppingList = location.pathname === '/shopping-list';
  const isSharedView = location.pathname.startsWith('/shared/');

  const showHeader = !isCookingMode && !isRecipeDetail && !isLogin && !isShoppingList && !isSharedView;
  const showBottomNav = !isCookingMode && !isLogin && !isSharedView;

  return (
    <>
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-slate-50 font-sans text-gray-900">
        {showHeader && (
          <Header
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSearch={onSearch}
            onNavigate={clearSearch}
            user={user}
          />
        )}

        <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-24 scroll-smooth">
          <div className="max-w-4xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {showBottomNav && (
        <BottomNav onNavClick={clearSearch} user={user} />
      )}
    </>
  );
};
