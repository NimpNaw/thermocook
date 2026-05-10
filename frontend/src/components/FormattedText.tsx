import React from 'react';
import { ICON_MAP, KEYWORD_ICON_MAP } from '../utils/constants';
import { formatTime } from '../utils/formatters';

interface FormattedTextProps {
  text: string;
  folder?: string;
  onTimerClick?: (seconds: number) => void;
  noTimerUnderline?: boolean;
}

// Détecte les durées en français : "1h30", "20 min", "1 min 30 sec", "45 secondes"
const DURATION_RE = /(\d+)\s*h(?:eure)?s?(?:\s*(\d+)\s*min(?:ute)?s?)?|(\d+)\s*min(?:ute)?s?(?:\s*(\d+)\s*sec(?:onde)?s?)?|(\d+)\s*sec(?:onde)?s?/gi;

const toSeconds = (m: RegExpMatchArray): number => {
  if (m[1]) return parseInt(m[1]) * 3600 + (m[2] ? parseInt(m[2]) * 60 : 0);
  if (m[3]) return parseInt(m[3]) * 60 + (m[4] ? parseInt(m[4]) : 0);
  if (m[5]) return parseInt(m[5]);
  return 0;
};

/** Retourne les secondes si le paramètre est une durée, null sinon. */
function paramToSeconds(param: string): number | null {
  const regex = new RegExp(DURATION_RE.source, 'i');
  const m = regex.exec(param.trim());
  if (!m) return null;
  const secs = toSeconds(m);
  return secs > 0 ? secs : null;
}

const TimerButton: React.FC<{ label: string; seconds: number; onClick: (s: number) => void; noUnderline?: boolean }> = ({ label, seconds, onClick, noUnderline }) => (
  <button
    onClick={() => onClick(seconds)}
    className={`inline font-black text-orange-500 transition-colors cursor-pointer hover:text-orange-600 ${noUnderline ? '' : 'border-b-2 border-orange-400 hover:border-orange-600'}`}
  >
    ⏱ {label}
  </button>
);

// Découpe un texte plat en alternant <span> et <TimerButton>
const splitWithTimers = (text: string, onTimerClick: (s: number) => void, prefix: string | number, noUnderline?: boolean): React.ReactNode => {
  const regex = new RegExp(DURATION_RE.source, 'gi');
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = regex.exec(text)) !== null) {
    const secs = toSeconds(m);
    if (secs <= 0) continue;
    if (m.index > last) nodes.push(<span key={`${prefix}-a${i++}`}>{text.slice(last, m.index)}</span>);
    nodes.push(<TimerButton key={`${prefix}-d${i++}`} label={m[0]} seconds={secs} onClick={onTimerClick} noUnderline={noUnderline} />);
    last = m.index + m[0].length;
  }

  if (last < text.length) nodes.push(<span key={`${prefix}-z${i}`}>{text.slice(last)}</span>);
  return nodes.length ? <>{nodes}</> : <span>{text}</span>;
};

/** Bloc de réglage Thermomix : {3 min/Varoma/vitesse 1} */
const ThermoBlock: React.FC<{ content: string; onTimerClick?: (s: number) => void; noUnderline?: boolean }> = ({ content, onTimerClick, noUnderline }) => {
  const params = content.split('/').map(p => p.trim()).filter(Boolean);

  const nodes = params.map((param, i) => {
    // Durée → bouton timer si disponible
    const secs = paramToSeconds(param);
    if (secs !== null) {
      return onTimerClick
        ? <TimerButton key={i} label={param} seconds={secs} onClick={onTimerClick} noUnderline={noUnderline} />
        : <span key={i}>{param}</span>;
    }
    // Mot-clé de mode (varoma, pétrin…) → icône
    // "vitesse mijotage" → strip "vitesse " pour permettre la résolution de l'icône
    const normalizedParam = param.toLowerCase().replace(/^vitesse\s+/, '');
    const icon = KEYWORD_ICON_MAP[normalizedParam];
    if (icon) return <span key={i} className="culinary-icon" title={param}>{icon}</span>;
    // Mode spécial TM5/TM6 ([THICKEN], [RICE], [BLEND]…) → icône via ICON_MAP
    const tagIcon = ICON_MAP[param.toUpperCase()];
    if (tagIcon) return <span key={i} className="culinary-icon" title={param}>{tagIcon}</span>;
    // Température, vitesse ou tag inconnu → texte brut
    return <span key={i}>{param}</span>;
  });

  return (
    <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 rounded px-2 py-0.5 mx-0.5 text-[0.875em] font-bold text-teal-800 align-middle">
      {nodes.map((node, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-teal-300 select-none">/</span>}
          {node}
        </React.Fragment>
      ))}
    </span>
  );
};

/** Rendu du texte legacy (tags [TAG] et timers inline). */
function renderLegacyText(
  text: string,
  onTimerClick: ((s: number) => void) | undefined,
  prefix: string | number,
  noUnderline?: boolean
): React.ReactNode[] {
  const TRAILING_TIME_RE = /\s*\d+\s*(?:min(?:utes?)?|sec(?:ondes?)?|h(?:eures?)?)\s*$/i;
  const rawParts = text.split(/(\[[\w_:]+\])/g);
  const parts = rawParts.map((part, idx) => {
    if (idx + 1 < rawParts.length && rawParts[idx + 1].startsWith('[TIMER:')) {
      return part.replace(TRAILING_TIME_RE, '');
    }
    return part;
  });

  return parts.map((part, i) => {
    const key = `${prefix}-${i}`;
    if (part.startsWith('[') && part.endsWith(']')) {
      if (part.startsWith('[TIMER:')) {
        const seconds = parseInt(part.replace('[TIMER:', '').replace(']', ''));
        return <TimerButton key={key} label={formatTime(seconds)} seconds={seconds} onClick={onTimerClick ?? (() => {})} noUnderline={noUnderline} />;
      }
      const unicode = ICON_MAP[part];
      if (unicode) return <span key={key} className="culinary-icon" title={part}>{unicode}</span>;
      return <span key={key} className="text-orange-600 font-mono text-[10px]">{part}</span>;
    }
    if (onTimerClick) return <React.Fragment key={key}>{splitWithTimers(part, onTimerClick, key, noUnderline)}</React.Fragment>;
    return <span key={key}>{part}</span>;
  });
}

export const FormattedText: React.FC<FormattedTextProps> = ({ text, folder, onTimerClick, noTimerUnderline }) => {
  if (!text) return null;

  if (text.startsWith('###')) {
    return (
      <h4 className="text-orange-700 font-black text-sm uppercase tracking-wider mt-4 mb-2 border-l-4 border-orange-500 pl-3">
        {text.replace('###', '').trim()}
      </h4>
    );
  }

  const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
  const hasImage = text.match(imgRegex);

  if (hasImage && folder) {
    const parts = text.split(imgRegex);
    return (
      <>
        {parts.map((part, i) => {
          if (i % 3 === 1) return null;
          if (i % 3 === 2) {
            const alt = parts[i - 1];
            const url = part.startsWith('http') ? part : `/api/assets/${folder}/${part}`;
            return (
              <img
                key={i}
                src={url}
                alt={alt}
                className="w-full rounded-xl my-4 shadow-sm border border-gray-100"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            );
          }
          return <FormattedText key={i} text={part} folder={folder} onTimerClick={onTimerClick} noTimerUnderline={noTimerUnderline} />;
        })}
      </>
    );
  }

  // Découpe par blocs {réglage Thermomix} puis rendu legacy pour le reste
  const segments = text.split(/(\{[^}]+\})/g);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith('{') && seg.endsWith('}')) {
          return <ThermoBlock key={i} content={seg.slice(1, -1)} onTimerClick={onTimerClick} noUnderline={noTimerUnderline} />;
        }
        return <React.Fragment key={i}>{renderLegacyText(seg, onTimerClick, i, noTimerUnderline)}</React.Fragment>;
      })}
    </>
  );
};
