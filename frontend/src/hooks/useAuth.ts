import { useState, useEffect, useCallback } from 'react';
import { api, User } from '../api';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    setUser(null);
  }, []);

  // Logout automatique sur 401 (token expiré ou révoqué)
  useEffect(() => {
    const handle = () => logout();
    window.addEventListener('thermocook:unauthorized', handle);
    return () => window.removeEventListener('thermocook:unauthorized', handle);
  }, [logout]);

  return { user, loading, logout, refreshUser: fetchUser };
};
