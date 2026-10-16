import { getColumn, includedColumns, isEmptyValue } from './model.js';
import { splitValues, parseNumber, toKey } from './values.js';
import { parseDate, responseDateAt } from './dates.js';
import { CHOICE_TYPES, QTYPE } from './constants.js';

export const FILTER_OPS = {
  eq: 'bằng',
  neq: 'khác',
  contains: 'chứa',
  not_contains: 'không chứa',
  empty: 'trống',
  not_empty: 'không trống',
  gt: 'lớn hơn',
  gte: 'lớn hơn hoặc bằng',
  lt: 'nhỏ hơn',
  lte: 'nhỏ hơn hoặc bằng',
};

export const FILTER_OP_LABEL = FILTER_OPS;

function compareNumeric(rawValue, target) {
  const n = parseNumber(rawValue);
  const t = parseNumber(target);
  if (n == null || t == null) return null;
  return n - t;
}

function conditionDate(response, column, dayFirst) {
  return responseDateAt(response, column.id, dayFirst);
}

function matchCondition(response, column, condition, opts) {
  const raw = response.values[column.id];
  const { op, value } = condition;
  const blank = isEmptyValue(raw);

  switch (op) {
    case 'empty':
      return blank;
    case 'not_empty':
      return !blank;
    case 'eq':
    case 'neq': {
      let hit;
      if (CHOICE_TYPES.has(column.type)) {
        const parts = splitValues(raw, column).map(toKey);
        hit = parts.includes(toKey(value));
      } else if (column.type === QTYPE.DATE) {
        const d = conditionDate(response, column, opts.dayFirst);
        const t = parseDate(value, { dayFirst: opts.dayFirst });
        hit = d && t ? d.toDateString() === t.toDateString() : toKey(raw) === toKey(value);
      } else {
        hit = toKey(raw) === toKey(value);
      }
      return op === 'eq' ? hit : !hit;
    }
    case 'contains':
    case 'not_contains': {
      let hit;
      if (CHOICE_TYPES.has(column.type)) {
        const parts = splitValues(raw, column).map(toKey);
        hit = parts.includes(toKey(value));
      } else {
        hit = String(raw ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      }
      return op === 'contains' ? hit : !hit;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      let cmp;
      if (column.type === QTYPE.DATE) {
        const d = conditionDate(response, column, opts.dayFirst);
        const t = parseDate(value, { dayFirst: opts.dayFirst });
        cmp = d && t ? d.getTime() - t.getTime() : null;
      } else {
        cmp = compareNumeric(raw, value);
      }
      if (cmp == null) return false;
      if (op === 'gt') return cmp > 0;
      if (op === 'gte') return cmp >= 0;
      if (op === 'lt') return cmp < 0;
      return cmp <= 0;
    }
    default:
      return true;
  }
}

export function activeFilterCount(filters) {
  if (!filters) return 0;
  let n = 0;
  if (filters.dateColumnId && (filters.dateFrom || filters.dateTo)) n += 1;
  if (filters.keyword && filters.keyword.trim()) n += 1;
  if (filters.groupByColumnId && filters.groups?.length) n += 1;
  n += (filters.conditions || []).length;
  return n;
}

export function matchesFilters(response, columns, filters, opts = {}) {
  if (!filters) return true;
  const dayFirst = opts.dayFirst !== false;

  if (filters.keyword && filters.keyword.trim()) {
    const needle = filters.keyword.trim().toLowerCase();
    const hay = includedColumns({ columns })
      .map((c) => String(response.values[c.id] ?? ''))
      .join('\n')
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  if (filters.groupByColumnId && filters.groups?.length) {
    const col = columns.find((c) => c.id === filters.groupByColumnId);
    if (col) {
      const vals = CHOICE_TYPES.has(col.type)
        ? splitValues(response.values[col.id], col).map(toKey)
        : [toKey(response.values[col.id])];
      const wanted = filters.groups.map(toKey);
      if (!vals.some((v) => wanted.includes(v))) return false;
    }
  }

  if (filters.dateColumnId && (filters.dateFrom || filters.dateTo)) {
    const col = columns.find((c) => c.id === filters.dateColumnId);
    if (col) {
      const d = responseDateAt(response, col.id, dayFirst);
      if (!d) return false;
      if (filters.dateFrom) {
        const from = parseDate(filters.dateFrom, { dayFirst });
        if (from && d.getTime() < from.getTime()) return false;
      }
      if (filters.dateTo) {
        const to = parseDate(filters.dateTo, { dayFirst });
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          if (d.getTime() > end.getTime()) return false;
        }
      }
    }
  }

  for (const cond of filters.conditions || []) {
    const col = getColumn({ columns }, cond.columnId);
    if (!col) continue;
    if (!matchCondition(response, col, cond, { dayFirst })) return false;
  }

  return true;
}

export function applyFilters(responses, columns, filters, opts = {}) {
  if (!filters || activeFilterCount(filters) === 0) return responses;
  return responses.filter((r) => matchesFilters(r, columns, filters, opts));
}

/**
 * Inspect the active date range and report bounds that cannot be understood.
 * The invalid bound is not applied (so data is not hidden by a typo), but the
 * caller must surface the issue instead of widening the range silently.
 */
export function dateFilterIssue(filters, opts = {}) {
  if (!filters?.dateColumnId || (!filters.dateFrom && !filters.dateTo)) return null;
  const dayFirst = opts.dayFirst !== false;
  const issues = [];
  const from = filters.dateFrom ? parseDate(filters.dateFrom, { dayFirst }) : null;
  const to = filters.dateTo ? parseDate(filters.dateTo, { dayFirst }) : null;
  if (filters.dateFrom && !from) issues.push(`“Từ ngày” không đọc được (“${filters.dateFrom}”) nên tạm bỏ qua.`);
  if (filters.dateTo && !to) issues.push(`“Đến ngày” không đọc được (“${filters.dateTo}”) nên tạm bỏ qua.`);
  if (from && to && from.getTime() > to.getTime()) issues.push('“Từ ngày” đang lớn hơn “Đến ngày”.');
  return issues.length ? { issues, from, to } : null;
}

/**
 * How many responses the active date filter excludes because they have no
 * valid date, so excluded rows are visible to the user instead of silently
 * disappearing from every KPI and chart.
 */
export function dateFilterStats(responses, column, filters, opts = {}) {
  if (!column || !filters?.dateColumnId || (!filters.dateFrom && !filters.dateTo)) return null;
  const dayFirst = opts.dayFirst !== false;
  let undated = 0;
  for (const r of responses) {
    if (!responseDateAt(r, column.id, dayFirst)) undated += 1;
  }
  return { undated, total: responses.length };
}

export function distinctValues(responses, column) {
  const seen = new Map();
  for (const r of responses) {
    const raw = r.values[column.id];
    if (isEmptyValue(raw)) continue;
    if (CHOICE_TYPES.has(column.type)) {
      for (const v of splitValues(raw, column)) {
        const k = toKey(v);
        seen.set(k, (seen.get(k) || 0) + 1);
      }
    } else {
      const k = toKey(raw);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  return [...seen.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
