// Reuses: JSON.parse. Glue: one tolerant parser for all model replies.
// Shared tolerant parser for model replies: plain JSON, fenced JSON, or an object embedded in prose.
function tryParse(s: string): unknown { try { return JSON.parse(s); } catch { return undefined; } }

/** Returns the first balanced {...} in text that parses as a JSON object. Throws if there is none. */
export function extractJson(text: string): any {
  const whole = tryParse(text.trim());
  if (whole && typeof whole === 'object') return whole;
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const v = tryParse(text.slice(i, j + 1));
        if (v && typeof v === 'object') return v;
        break;
      }
    }
  }
  throw new Error('no JSON object found in model reply');
}
