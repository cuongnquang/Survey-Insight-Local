import { SEPARATORS } from './constants.js';
import { isEmptyValue } from './model.js';

export function separatorFor(column) {
  if (!column) return ',';
  if (column.separator === 'custom') return column.customSeparator || '';
  return SEPARATORS[column.separator] ?? ',';
}

export function splitValues(raw, column) {
  if (isEmptyValue(raw)) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const sep = separatorFor(column);
  if (!sep) return [String(raw).trim()];
  return String(raw)
    .split(sep)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const NUM_RE = /^-?\d+(?:[.,]\d+)?$/;
const NUM_SUFFIX_RE = /^-?\d+(?:[.,]\d+)?\s*(?:sao|star|stars|điểm|diem|point|points)?$/i;

export function parseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (NUM_RE.test(s)) return Number(s.replace(',', '.'));
  if (NUM_SUFFIX_RE.test(s)) {
    const m = s.match(/^-?\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  }
  return null;
}

export function toKey(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

export { isEmptyValue };
