/**
 * Recursively walks a value. Replaces any object matching the shape
 * {text: string, evidence_url?: string, confidence?: string|number} with just its `text` string.
 * Leaves all other objects/arrays/primitives intact.
 * Hoists evidence_url/confidence to sibling fields (e.g. role + role_evidence_url + role_confidence)
 * ONLY at the object level.
 */

type EvidenceWrapper = {
  text: string;
  evidence_url?: string;
  confidence?: string | number;
};

function isEvidenceWrapper(value: unknown): value is EvidenceWrapper {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;

  // Must have `text` as a string
  if (typeof obj.text !== 'string') return false;

  // Must have at least one of evidence_url or confidence
  if (!('evidence_url' in obj) && !('confidence' in obj)) return false;

  // STRICT: only allow text + evidence_url + confidence. If any other field exists
  // (e.g. level, icon, category, headline, date), this is a richer object — preserve it.
  const ALLOWED = new Set(['text', 'evidence_url', 'confidence']);
  for (const k of Object.keys(obj)) {
    if (!ALLOWED.has(k)) return false;
  }

  return true;
}

export function flattenEvidence<T>(value: T): T {
  // Handle null/undefined
  if (value == null) return value;

  // Handle primitives
  if (typeof value !== 'object') return value;

  // Handle arrays — collapse wrapper items to just their text
  if (Array.isArray(value)) {
    return value.map(item => {
      if (isEvidenceWrapper(item)) return item.text;
      return flattenEvidence(item);
    }) as T;
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value)) {
    if (isEvidenceWrapper(val)) {
      // Replace wrapper with just the text
      result[key] = val.text;

      // Hoist metadata to sibling fields
      if (val.evidence_url !== undefined) {
        result[`${key}_evidence_url`] = val.evidence_url;
      }
      if (val.confidence !== undefined) {
        result[`${key}_confidence`] = val.confidence;
      }
    } else {
      // Recurse into nested structures
      result[key] = flattenEvidence(val);
    }
  }

  return result as T;
}
