export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
};

// Unités masse/volume : si elles apparaissent sans chiffre devant, on les supprime
// Ex: "g de beurre" → "beurre", "g d'oignon" → "oignon"
// Les unités de comptage (pincée, gousse…) restent car elles sont informatives sans chiffre.
const ORPHAN_UNIT_RE = /^(?:g|ml|cl|dl|kg|gr|c\.\s*à\s*soupe|c\.\s*à\s*café)\s+(?:d[''\u2019]|de l[''\u2019]|du |de la |des |de |l[''\u2019]|le |la )?/i;

export const cleanIngredient = (text: string) => {
  let cleaned = text.replace(/\bQS\b/g, '').replace(/\s+/g, ' ').trim();
  if (!/^\d/.test(cleaned)) {
    cleaned = cleaned.replace(ORPHAN_UNIT_RE, '').trim();
  }
  return cleaned;
};

export const splitIngredient = (text: string): { main: string; precision: string | null } => {
  const firstParen = text.indexOf('(');
  if (firstParen === -1) return { main: text, precision: null };

  let depth = 0;
  let end = -1;
  for (let i = firstParen; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) return { main: text, precision: null };

  const main = text.slice(0, firstParen).trim();
  const precision = text.slice(firstParen + 1, end).trim();
  return { main: main || text, precision: precision || null };
};
