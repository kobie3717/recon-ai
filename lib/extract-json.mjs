/**
 * Extract JSON from Claude responses that may include prose or markdown fences.
 * Handles common patterns:
 * - ```json ... ``` fences
 * - Prose before/after JSON
 * - Balanced brace extraction
 *
 * @param {string} text - Raw Claude output
 * @returns {Object} - Parsed JSON object
 * @throws {Error} - If no valid JSON found or parse fails
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('extractJson: empty or invalid input');
  }

  // Strip ```json fences (case-insensitive)
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

  // Try direct parse first (fast path for clean JSON)
  try {
    return JSON.parse(s);
  } catch {}

  // Find balanced outermost {} or []
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  let start = -1;

  if (firstObj === -1 && firstArr === -1) {
    throw new Error('extractJson: no JSON object or array found');
  }

  if (firstObj === -1) {
    start = firstArr;
  } else if (firstArr === -1) {
    start = firstObj;
  } else {
    start = Math.min(firstObj, firstArr);
  }

  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];

    if (esc) {
      esc = false;
      continue;
    }

    if (c === '\\') {
      esc = true;
      continue;
    }

    if (c === '"') {
      inStr = !inStr;
      continue;
    }

    if (inStr) continue;

    if (c === open) {
      depth++;
    } else if (c === close) {
      depth--;
      if (depth === 0) {
        // Found balanced closing bracket
        return JSON.parse(s.slice(start, i + 1));
      }
    }
  }

  throw new Error('extractJson: unbalanced braces');
}
