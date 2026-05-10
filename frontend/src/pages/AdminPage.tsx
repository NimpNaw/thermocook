import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, ShieldAlert, BookOpen, Users, Heart,
  NotebookPen, Loader2, UserPlus, KeyRound, Check, X, ChevronDown, ChevronUp, Package,
  RefreshCw, ImageOff, AlertTriangle, CheckCircle, Download,
} from 'lucide-react';
import { api, AdminStats, User, ImportStatus, ImportLogEntry, SyncResult } from '../api';
import { useToastContext } from '../context/ToastContext';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
    <div>
      <p className="text-2xl font-black text-gray-900">{value.toLocaleString('fr-FR')}</p>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
    </div>
  </div>
);

interface AdminPageProps {
  currentUser: User | null;
  authLoading?: boolean;
  onCacheInvalidate?: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ currentUser, authLoading, onCacheInvalidate }) => {
  const navigate = useNavigate();
  const showToast = useToastContext();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Création d'utilisateur
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // Changement de mot de passe
  const [pwdUserId, setPwdUserId] = useState<number | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // Import de packages
  const [importTab, setImportTab] = useState<'url' | 'path'>('url');
  const [importValue, setImportValue] = useState('');
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [importing, setImporting] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync catalogue
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ 
    processed: number; 
    total: number; 
    current_recipe: string; 
    errors: number 
  } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const syncPollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nettoyage images
  const [cleaning, setCleaning] = useState(false);
  const [clearingRecipes, setClearingRecipes] = useState(false);

  // Logs d'erreurs d'import
  const [importErrors, setImportErrors] = useState<ImportLogEntry[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const stopPolling = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  };

  const startImportPolling = (jobId: string) => {
    stopPolling();
    setImporting(true);
    setCurrentJobId(jobId);
    const tick = async () => {
      try {
        const status = await api.getImportStatus(jobId);
        setImportStatus(status);
        if (status.status === 'done') {
          stopPolling();
          setImporting(false);
          showToast('Import terminé avec succès', 'success');
          api.getAdminStats().then(setStats).catch(() => {});
          onCacheInvalidate?.();
          loadAlerts();
        } else if (status.status === 'error') {
          stopPolling();
          setImporting(false);
          showToast(`Erreur : ${status.message}`);
          loadAlerts();
        } else {
          pollRef.current = setTimeout(tick, 2000);
        }
      } catch {
        stopPolling();
        setImporting(false);
        showToast("Impossible de récupérer l'état de l'import");
      }
    };
    pollRef.current = setTimeout(tick, 2000);
  };

  const stopSyncPolling = () => {
    if (syncPollRef.current) { clearTimeout(syncPollRef.current); syncPollRef.current = null; }
  };

  const startSyncPolling = () => {
    stopSyncPolling();
    const tick = async () => {
      try {
        const s = await api.getSyncStatus();
        if (s.total > 0) {
          setSyncProgress({
            processed: s.processed,
            total: s.total,
            current_recipe: s.current_recipe,
            errors: s.errors
          });
        }
        if (!s.running) {
          stopSyncPolling();
          setSyncing(false);
          setSyncProgress(null);
          if (s.result?.status === 'done') {
            setSyncResult(s.result);
            showToast(
              `Sync terminée : +${s.result.added} ajout(s), ${s.result.updated} màj, ${s.result.deleted} suppression(s)`,
              'success'
            );
            api.getAdminStats().then(setStats).catch(() => {});
            onCacheInvalidate?.();
          } else {
            setSyncResult(s.result);
            if (s.result) showToast(`Erreur sync : ${s.result.message}`);
          }
        } else {
          syncPollRef.current = setTimeout(tick, 2000);
        }
      } catch { stopSyncPolling(); setSyncing(false); }
    };
    syncPollRef.current = setTimeout(tick, 2000);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress(null);
    setSyncResult(null);
    try {
      await api.syncCatalog();
      startSyncPolling();
    } catch (err: any) {
      setSyncing(false);
      showToast(err.message || 'Erreur lors du démarrage de la synchronisation');
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const result = await api.cleanupImages();
      showToast(`Nettoyage terminé : ${result.deleted} miniature(s) supprimée(s)`, 'success');
    } catch {
      showToast('Erreur lors du nettoyage des images');
    } finally {
      setCleaning(false);
    }
  };

  const handleClearRecipes = async () => {
    if (!confirm('Vider toutes les recettes ? Cette action est irréversible.')) return;
    setClearingRecipes(true);
    try {
      const result = await api.clearRecipes();
      showToast(`Base vidée : ${result.deleted} recette(s) supprimée(s)`, 'success');
      api.getAdminStats().then(setStats).catch(() => {});
      onCacheInvalidate?.();
    } catch {
      showToast('Erreur lors de la suppression des recettes');
    } finally {
      setClearingRecipes(false);
    }
  };

  const loadAlerts = () => {
    api.getAlerts().then(a => setUnresolvedCount(a.unresolved_errors)).catch(() => {});
  };

  const loadErrors = () => {
    api.getImportErrors().then(setImportErrors).catch(() => {});
  };

  const handleResolveError = async (errorId: number) => {
    try {
      await api.resolveImportError(errorId);
      setImportErrors(prev => prev.map(e => e.id === errorId ? { ...e, is_resolved: true } : e));
      setUnresolvedCount(prev => Math.max(0, prev - 1));
    } catch {
      showToast('Impossible de marquer cette erreur comme résolue');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importValue.trim()) return;
    setImportStatus(null);
    try {
      const { job_id } = await api.importPackage(importTab, importValue.trim());
      startImportPolling(job_id);
    } catch (err: any) {
      setImporting(false);
      showToast(err.message || "Erreur lors du démarrage de l'import");
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.is_admin) { navigate('/'); return; }
    
    // Charger les données initiales
    Promise.all([api.getAdminStats(), api.getAdminUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u); })
      .catch(() => showToast('Erreur lors du chargement des données admin'))
      .finally(() => setLoading(false));

    // Reconnexion à un import en cours (si l'utilisateur a quitté la page)
    api.getActiveImportJob().then(active => {
      if (!active) return;
      setImportStatus({ status: active.status, progress: active.progress, message: active.message, errors: active.errors });
      setCurrentJobId(active.job_id);
      // Ne pas démarrer le polling si un intervalle est déjà actif (ex: double-mount StrictMode)
      if (active.status !== 'done' && active.status !== 'error' && !pollRef.current) {
        startImportPolling(active.job_id);
      }
    }).catch(() => {});

    // Vérifier l'état de la synchronisation au cas où une est déjà en cours
    api.getSyncStatus().then(s => {
      if (s.running) {
        setSyncing(true);
        startSyncPolling();
      } else if (s.result) {
        // Restaurer le dernier résultat affiché
        setSyncResult(s.result);
      }
    }).catch(() => {});

    api.getAlerts().then(a => {
      setUnresolvedCount(a.unresolved_errors);
      if (a.unresolved_errors > 0) {
        setShowErrors(true);
        loadErrors();
      }
    }).catch(() => {});
    return () => { stopPolling(); stopSyncPolling(); };
  }, [currentUser, authLoading, navigate, showToast]);

  const handleDelete = async (user: User) => {
    if (!confirm(`Supprimer "${user.username}" ? Cette action est irréversible.`)) return;
    setDeletingId(user.id);
    try {
      await api.deleteAdminUser(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      showToast(`Utilisateur "${user.username}" supprimé.`, 'success');
    } catch {
      showToast('Impossible de supprimer cet utilisateur.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    setCreating(true);
    try {
      const created = await api.createAdminUser(newUsername.trim(), newPassword, newIsAdmin);
      setUsers(prev => [...prev, created]);
      setNewUsername(''); setNewPassword(''); setNewIsAdmin(false); setShowCreate(false);
      showToast(`Utilisateur "${created.username}" créé.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la création.');
    } finally {
      setCreating(false);
    }
  };

  const handleChangePassword = async (user: User) => {
    if (!newPwd.trim()) return;
    setSavingPwd(true);
    try {
      await api.changeAdminPassword(user.id, newPwd);
      setPwdUserId(null); setNewPwd('');
      showToast(`Mot de passe de "${user.username}" modifié.`, 'success');
    } catch {
      showToast('Erreur lors du changement de mot de passe.');
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) return (
    <div className="p-20 text-center text-orange-500 font-bold animate-pulse">Chargement du tableau de bord...</div>
  );

  return (
    <div className="bg-slate-50 min-h-screen pb-24">
      <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400"><ArrowLeft /></button>
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-orange-500" />
          <h2 className="text-lg font-black text-gray-900 uppercase">Administration</h2>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-8">
        {/* Statistiques */}
        <section>
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">Statistiques du site</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={<BookOpen size={22} className="text-orange-600" />} label="Recettes" value={stats?.recipes ?? 0} color="bg-orange-100" />
            <StatCard icon={<Users size={22} className="text-blue-600" />} label="Utilisateurs" value={stats?.users ?? 0} color="bg-blue-100" />
            <StatCard icon={<Heart size={22} className="text-red-500" />} label="Favoris" value={stats?.favorites ?? 0} color="bg-red-100" />
            <StatCard icon={<NotebookPen size={22} className="text-purple-600" />} label="Notes" value={stats?.notes ?? 0} color="bg-purple-100" />
          </div>
        </section>

        {/* Gestion des recettes */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Gestion des recettes</h3>
            {unresolvedCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {unresolvedCount} erreur{unresolvedCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="space-y-6">

            {/* Import package */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-2 px-1">Import package</p>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <form onSubmit={handleImport} className="space-y-3">
                  <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => { setImportTab('url'); setImportValue(''); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${importTab === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      URL distante
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImportTab('path'); setImportValue(''); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${importTab === 'path' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Chemin local
                    </button>
                  </div>
                  <input
                    type="text"
                    value={importValue}
                    onChange={e => setImportValue(e.target.value)}
                    placeholder={importTab === 'url'
                      ? 'https://exemple.com/recettes_v1.0.0.tar.gz'
                      : '/data/packages/recettes_v1.0.0.tar.gz'}
                    required
                    disabled={importing || syncing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#006d5b] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={importing || syncing || !importValue.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#006d5b] text-white rounded-xl text-sm font-bold disabled:opacity-60 hover:bg-[#005a4b] transition-colors"
                  >
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />}
                    {importing ? 'Import en cours...' : 'Installer'}
                  </button>
                </form>
                {importStatus && (
                  <div className="mt-4 space-y-2">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${importStatus.status === 'error' ? 'bg-red-500' : 'bg-[#006d5b]'}`}
                        style={{ width: `${importStatus.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs ${importStatus.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                        {importStatus.message}
                      </p>
                      {currentJobId && (importStatus.status === 'done' || importStatus.status === 'error') && (
                        <a
                          href={api.getImportLogUrl(currentJobId)}
                          download
                          className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                        >
                          <Download size={12} />
                          Log{(importStatus.errors?.length ?? 0) > 0 ? ` (${importStatus.errors!.length} erreur${importStatus.errors!.length > 1 ? 's' : ''})` : ''}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Synchronisation */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-2 px-1">Synchronisation</p>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSync}
                    disabled={syncing || importing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 hover:bg-blue-700 transition-colors"
                  >
                    {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {syncing ? 'Synchronisation...' : 'Synchronisation complète'}
                  </button>
                </div>
                {syncing && syncProgress && syncProgress.total > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 bg-blue-600 transition-all duration-500 ease-out"
                        style={{ width: `${Math.round((syncProgress.processed / syncProgress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                      <div className="text-gray-500 flex items-center gap-2">
                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                          {Math.round((syncProgress.processed / syncProgress.total) * 100)}%
                        </span>
                        <span>{syncProgress.processed.toLocaleString('fr-FR')} / {syncProgress.total.toLocaleString('fr-FR')} recettes</span>
                      </div>
                      {syncProgress.errors > 0 && (
                        <div className="text-red-500 bg-red-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <AlertTriangle size={10} />
                          {syncProgress.errors} ERREUR{syncProgress.errors > 1 ? 'S' : ''}
                        </div>
                      )}
                    </div>
                    {syncProgress.current_recipe && (
                      <p className="text-[10px] text-gray-400 truncate italic">
                        Traitement : {syncProgress.current_recipe}
                      </p>
                    )}
                  </div>
                )}
                {!syncing && syncResult && (
                  <div className={`mt-4 text-xs font-medium px-3 py-2 rounded-xl space-y-1 ${syncResult.status === 'done' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {syncResult.status === 'done' ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            +{syncResult.added} ajout(s) · {syncResult.updated} màj · {syncResult.deleted} suppression(s)
                            {(syncResult.errors ?? 0) > 0 && (
                              <span className="text-red-500 ml-1">· {syncResult.errors} erreur(s)</span>
                            )}
                          </span>
                          <a
                            href={api.getSyncLogUrl()}
                            download
                            className="flex items-center gap-1 px-2 py-1 font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                          >
                            <Download size={12} />
                            Log{(syncResult.errors ?? 0) > 0 ? ` (${syncResult.errors} erreur${syncResult.errors! > 1 ? 's' : ''})` : ''}
                          </a>
                        </div>
                        {(syncResult.stale_in_db ?? []).length > 0 && (
                          <div className="text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                            ⚠️ {syncResult.stale_in_db!.length} recette(s) corrompue(s) sur disque conservée(s) en base avec données périmées : {syncResult.stale_in_db!.join(', ')}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span>{syncResult.message ?? 'Erreur lors de la synchronisation'}</span>
                        <a
                          href={api.getSyncLogUrl()}
                          download
                          className="flex items-center gap-1 px-2 py-1 font-bold text-red-600 bg-white/60 hover:bg-white rounded-lg transition-colors shrink-0"
                        >
                          <Download size={12} />
                          Log
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Maintenance */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-2 px-1">Maintenance</p>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleCleanup}
                    disabled={cleaning}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 hover:bg-gray-700 transition-colors"
                  >
                    {cleaning ? <Loader2 size={15} className="animate-spin" /> : <ImageOff size={15} />}
                    {cleaning ? 'Nettoyage...' : 'Nettoyer les images'}
                  </button>
                  <button
                    onClick={handleClearRecipes}
                    disabled={clearingRecipes}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 hover:bg-red-700 transition-colors"
                  >
                    {clearingRecipes ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    {clearingRecipes ? 'Suppression...' : 'Vider les recettes'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Log d'erreurs d'import */}
        {unresolvedCount > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Erreurs d'import</h3>
                <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{unresolvedCount}</span>
              </div>
              <button
                onClick={() => { setShowErrors(v => !v); if (!showErrors) loadErrors(); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showErrors ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showErrors && (
              <div className="space-y-2">
                {importErrors.map(err => (
                  <div key={err.id} className={`bg-white rounded-xl border p-3 flex items-start gap-3 ${err.is_resolved ? 'border-gray-100 opacity-60' : 'border-red-100'}`}>
                    <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${err.is_resolved ? 'text-gray-400' : 'text-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-700 truncate">{err.source}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{err.error}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(err.created_at).toLocaleString('fr-FR')}</p>
                    </div>
                    {!err.is_resolved && (
                      <button onClick={() => handleResolveError(err.id)} className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg" title="Marquer comme résolu">
                        <CheckCircle size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Gestion des utilisateurs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
              Utilisateurs ({users.length})
            </h3>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-[#006d5b] text-white rounded-xl text-xs font-bold hover:bg-[#005a4b] transition-colors"
            >
              <UserPlus size={15} />
              Créer
              {showCreate ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Formulaire de création */}
          {showCreate && (
            <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-green-100 p-4 mb-4 shadow-sm space-y-3">
              <h4 className="text-sm font-black text-gray-700">Nouvel utilisateur</h4>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Nom d'utilisateur"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  required
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#006d5b]"
                />
                <input
                  type="password"
                  placeholder="Mot de passe"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#006d5b]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newIsAdmin}
                  onChange={e => setNewIsAdmin(e.target.checked)}
                  className="rounded accent-orange-500"
                />
                Administrateur
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 px-4 py-2 bg-[#006d5b] text-white rounded-xl text-sm font-bold disabled:opacity-60"
                >
                  {creating ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Créer
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-400 text-sm">
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Liste des utilisateurs */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            {users.map((user, idx) => (
              <div key={user.id}>
                <div className={`flex items-center justify-between px-5 py-4 ${idx !== users.length - 1 || pwdUserId === user.id ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${user.is_admin ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{user.username}</span>
                        {user.is_admin && <span className="text-[10px] bg-orange-100 text-orange-600 font-black px-2 py-0.5 rounded-full uppercase">Admin</span>}
                        {!user.is_active && <span className="text-[10px] bg-red-100 text-red-500 font-black px-2 py-0.5 rounded-full uppercase">Inactif</span>}
                      </div>
                      <p className="text-xs text-gray-400">Inscrit le {new Date(user.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setPwdUserId(pwdUserId === user.id ? null : user.id); setNewPwd(''); }}
                      className="p-2 text-gray-300 hover:text-[#006d5b] hover:bg-green-50 rounded-xl transition-colors"
                      title="Changer le mot de passe"
                    >
                      <KeyRound size={16} />
                    </button>
                    {!user.is_admin && (
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id}
                        className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-40"
                      >
                        {deletingId === user.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Formulaire inline changement de mot de passe */}
                {pwdUserId === user.id && (
                  <div className="px-5 py-3 bg-green-50 border-b border-gray-50 flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="Nouveau mot de passe"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      autoFocus
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#006d5b]"
                    />
                    <button
                      onClick={() => handleChangePassword(user)}
                      disabled={savingPwd || !newPwd.trim()}
                      className="p-2 bg-[#006d5b] text-white rounded-xl disabled:opacity-50"
                    >
                      {savingPwd ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button onClick={() => { setPwdUserId(null); setNewPwd(''); }} className="p-2 text-gray-400 rounded-xl">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
