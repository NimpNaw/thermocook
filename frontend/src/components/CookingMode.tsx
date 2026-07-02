import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, CheckCircle2, Timer as TimerIcon, Play, Pause, RotateCcw, WifiOff } from 'lucide-react';
import { FormattedText } from './FormattedText';
import { useRecipeQuery } from '../hooks/queries/useRecipeQueries';

// Asset local (précaché par le service worker via includeAssets) : un son
// hébergé sur un CDN externe serait silencieux hors-ligne.
const TIMER_END_SOUND = '/sounds/timer-end.wav';

export const CookingMode: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // useRecipeQuery réutilise le cache TanStack Query : la recette vient d'être
  // affichée sur la fiche détail, le Mode Cuisine démarre donc instantanément
  // même hors-ligne, et les échecs réseau sont gérés (pas d'écran blanc).
  const { data: recipe, isLoading, isError, refetch } = useRecipeQuery(id);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // Timer State
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState<number>(0);
  const stepsLengthRef = useRef(0);

  const navigate = useNavigate();

  // Décompte du minuteur
  useEffect(() => {
    if (!isTimerRunning || !timerSeconds || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  // Fin du minuteur : effet séparé, dépendant UNIQUEMENT de timerSeconds.
  // Dans l'ancien effet unique, le setIsTimerRunning(false) de la branche
  // « fin » redéclenchait l'effet (isTimerRunning en dépendance) : vibration
  // et sonnerie partaient deux fois.
  useEffect(() => {
    if (timerSeconds !== 0) return;
    setIsTimerRunning(false);
    if ('vibrate' in navigator) navigator.vibrate([500, 200, 500]);
    const audio = new Audio(TIMER_END_SOUND);
    audio.play().catch(() => {});
    // Passage automatique à l'étape suivante après un court délai.
    // Le timeout doit être nettoyé si l'utilisateur quitte ou clique manuellement
    // sur Suivant entre-temps, sinon on avance d'une étape de trop.
    const advanceTimeout = setTimeout(() => {
      setTimerSeconds(null);
      setCurrentStepIndex(prev => Math.min(prev + 1, stepsLengthRef.current - 1));
    }, 1500);
    return () => clearTimeout(advanceTimeout);
  }, [timerSeconds]);

  const startTimer = (secs: number) => {
    setInitialTimerSeconds(secs);
    setTimerSeconds(secs);
    setIsTimerRunning(true);
  };

  const formatTime = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let wakeLock: any = null;
    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          const lock = await (navigator as any).wakeLock.request('screen');
          // Si le composant a été démonté pendant la requête en vol, relâcher
          // immédiatement le verrou obtenu (sinon l'écran reste éveillé).
          if (cancelled) {
            lock.release();
            return;
          }
          wakeLock = lock;
        }
      } catch (err) {
        console.warn("Wake Lock non supporté.");
      }
    };
    // Le navigateur relâche automatiquement le verrou quand l'app passe en
    // arrière-plan (appel, verrouillage manuel, changement d'app) et ne le
    // réacquiert PAS tout seul : sans ce listener, l'écran se reverrouille
    // pour le reste de la session de cuisine.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (wakeLock) wakeLock.release();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex items-center justify-center">
        <div role="status" aria-label="Chargement" className="flex items-center gap-2 text-[#006d5b] animate-pulse">
          <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-[#006d5b] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center gap-6 p-8 text-center">
        <WifiOff size={48} className="text-gray-300" />
        <div>
          <p className="text-lg font-bold text-gray-900">Impossible de charger la recette</p>
          <p className="text-sm text-gray-500 mt-1">Vérifiez votre connexion puis réessayez.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="px-8 py-4 bg-white border border-gray-200 text-gray-600 rounded-2xl font-black shadow-sm active:scale-95 transition-all"
          >
            Retour
          </button>
          <button
            onClick={() => refetch()}
            className="px-8 py-4 bg-[#006d5b] text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const steps = recipe.steps_json?.filter(s => !s.text.trim().startsWith('###')) || [];
  stepsLengthRef.current = steps.length;
  const currentStep = steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col font-sans text-gray-900">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-md">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-600"><X size={24} /></button>
        <div className="text-center flex-1 mx-4">
          <h2 className="text-sm font-black text-gray-900 truncate uppercase tracking-tight">{recipe.title}</h2>
          <p className="text-[10px] text-orange-600 font-bold uppercase">Étape {currentStepIndex + 1} sur {steps.length}</p>
        </div>
        <div className="w-10"></div>
      </div>

      <div className="w-full h-1.5 bg-gray-100">
        <div className="h-full bg-green-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
      </div>

      {timerSeconds !== null && (
        <div className={`${timerSeconds === 0 ? 'bg-red-500 animate-pulse' : 'bg-orange-500'} text-white flex items-center justify-center gap-4 shadow-lg`}>
          <div className="flex items-center gap-3">
            <TimerIcon className={isTimerRunning ? 'animate-spin' : ''} />
            <span className="text-2xl font-black font-mono">{formatTime(timerSeconds)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsTimerRunning(!isTimerRunning)} className="p-2 bg-white/20 rounded-lg">
              {isTimerRunning ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <button onClick={() => setTimerSeconds(initialTimerSeconds)} className="p-2 bg-white/20 rounded-lg">
              <RotateCcw />
            </button>
            <button onClick={() => setTimerSeconds(null)} className="p-2 bg-black/20 rounded-lg">
              <X />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <div className="mb-10 inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-2xl font-black text-2xl shadow-sm">
            {currentStepIndex + 1}
          </div>
          
          <div className="text-xl md:text-3xl font-medium text-gray-800 leading-relaxed mb-12 text-justify w-full">
            <FormattedText
              text={currentStep?.text || ''}
              folder={recipe.folder_name || `${recipe.slug}_${recipe.id}`}
              onTimerClick={startTimer}
              noTimerUnderline
            />
          </div>
        </div>
      </div>

      <div className="p-6 bg-gray-50/50 flex gap-4 border-t border-gray-100">
        <button 
          onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))} 
          disabled={currentStepIndex === 0} 
          className="flex-1 py-6 bg-white border border-gray-200 rounded-3xl text-gray-400 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
        >
          <ChevronLeft size={32} strokeWidth={3} />
        </button>
        {currentStepIndex < steps.length - 1 ? (
          <button 
            onClick={() => setCurrentStepIndex(prev => prev + 1)} 
            className="flex-[2] py-6 bg-[#006d5b] text-white rounded-3xl flex items-center justify-center gap-3 font-black text-xl shadow-xl active:scale-95 transition-all"
          >
            Suivant <ChevronRight size={32} strokeWidth={3} />
          </button>
        ) : (
          <button 
            onClick={() => navigate(-1)} 
            className="flex-[2] py-6 bg-orange-600 text-white rounded-3xl flex items-center justify-center gap-3 font-black text-xl shadow-xl active:scale-95 transition-all"
          >
            Terminé ! <CheckCircle2 size={32} strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
};
