import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, CheckCircle2, Timer as TimerIcon, Play, Pause, RotateCcw } from 'lucide-react';
import { api, Recipe } from '../api';
import { FormattedText } from './FormattedText';

export const CookingMode: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Timer State
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState<number>(0);
  const stepsLengthRef = useRef(0);

  const navigate = useNavigate();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let advanceTimeout: ReturnType<typeof setTimeout> | null = null;
    if (isTimerRunning && timerSeconds && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => (prev && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerRunning(false);
      if ('vibrate' in navigator) navigator.vibrate([500, 200, 500]);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {});
      // Passage automatique à l'étape suivante après un court délai.
      // Le timeout doit être nettoyé si l'utilisateur quitte ou clique manuellement
      // sur Suivant entre-temps, sinon on avance d'une étape de trop.
      advanceTimeout = setTimeout(() => {
        setTimerSeconds(null);
        setCurrentStepIndex(prev => Math.min(prev + 1, stepsLengthRef.current - 1));
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
      if (advanceTimeout) clearTimeout(advanceTimeout);
    };
  }, [isTimerRunning, timerSeconds]);

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
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.warn("Wake Lock non supporté.");
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  useEffect(() => {
    if (id) {
      api.getRecipe(id).then(setRecipe).finally(() => setLoading(false));
    }
  }, [id]);

  if (loading || !recipe) return null;

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
