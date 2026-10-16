import { CHOICE_TYPES, QTYPE, SCALE_TYPES, TEXT_TYPES } from '../core/constants.js';
import { includedColumns, isEmptyValue } from '../core/model.js';
import { splitValues, parseNumber, toKey } from '../core/values.js';
import { toDateKey, responseDateAt } from '../core/dates.js';
import { mean, median, min as minOf, max as maxOf, pct, round } from './stats.js';
import { keywordFrequency, findDuplicates, clusterByTokens } from './text.js';

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

export function buildQuestionGroups(dataset) {
  const cols = includedColumns(dataset);
  const byBase = new Map();
  const groups = [];
  const usedIds = new Set();
  const uniqueId = (base) => {
    const root = `grid:${slug(base)}`;
    let id = root;
    let n = 1;
    while (usedIds.has(id)) {
      n += 1;
      id = `${root}-${n}`;
    }
    usedIds.add(id);
    return id;
  };
  for (const col of cols) {
    if (col.gridBase) {
      let g = byBase.get(col.gridBase);
      if (!g) {
        g = { id: uniqueId(col.gridBase), title: col.gridBase, gridBase: col.gridBase, columns: [] };
        byBase.set(col.gridBase, g);
        groups.push(g);
      }
      g.columns.push(col);
    } else {
      usedIds.add(col.id);
      groups.push({ id: col.id, title: col.name || col.header, gridBase: null, columns: [col] });
    }
  }
  return groups;
}

function analyzeCategorical(column, responses, multi) {
  const counts = new Map();
  let valid = 0;
  let blank = 0;
  for (const r of responses) {
    const raw = r.values[column.id];
    if (isEmptyValue(raw)) {
      blank += 1;
      continue;
    }
    const parts = multi ? splitValues(raw, column) : [String(raw).replace(/\s+/g, ' ').trim()];
    const clean = parts.filter((p) => p !== '');
    if (clean.length === 0) {
      blank += 1;
      continue;
    }
    valid += 1;
    for (const p of clean) {
      const k = toKey(p);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const categories = [...counts.entries()]
    .map(([value, count]) => ({ value, count, pct: round(pct(count, valid), 1) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    kind: 'categorical',
    type: column.type,
    multi: !!multi,
    total: responses.length,
    valid,
    blank,
    categories,
    note: multi
      ? 'Câu hỏi nhiều lựa chọn: mỗi người có thể chọn nhiều đáp án, tổng tỷ lệ có thể vượt 100%. Tỷ lệ tính trên số người trả lời hợp lệ.'
      : 'Tỷ lệ tính trên số người trả lời hợp lệ cho câu hỏi này.',
  };
}

function analyzeScale(column, responses) {
  const nums = [];
  const invalid = [];
  let blank = 0;
  const bounds = column.scale && Number.isFinite(column.scale.min) ? column.scale : null;
  for (const r of responses) {
    const raw = r.values[column.id];
    if (isEmptyValue(raw)) {
      blank += 1;
      continue;
    }
    const n = parseNumber(raw);
    if (n == null) {
      invalid.push(String(raw));
      continue;
    }
    if (bounds && (n < bounds.min || n > bounds.max)) {
      invalid.push(String(raw));
      continue;
    }
    nums.push(n);
  }
  const distMap = new Map();
  for (const n of nums) distMap.set(n, (distMap.get(n) || 0) + 1);
  const valid = nums.length;
  const distribution = [...distMap.entries()]
    .map(([value, count]) => ({ value, count, pct: round(pct(count, valid), 1) }))
    .sort((a, b) => a.value - b.value);
  return {
    kind: 'scale',
    type: column.type,
    total: responses.length,
    valid,
    blank,
    invalid: invalid.length,
    invalidSamples: invalid.slice(0, 50),
    scale: bounds ? { min: bounds.min, max: bounds.max } : null,
    mean: round(mean(nums), 2),
    median: round(median(nums), 2),
    min: minOf(nums),
    max: maxOf(nums),
    distribution,
  };
}

function analyzeTextQuestion(column, responses) {
  const entries = [];
  responses.forEach((r, index) => {
    const raw = r.values[column.id];
    if (!isEmptyValue(raw)) entries.push({ value: String(raw), index });
  });
  const blank = responses.length - entries.length;
  const texts = entries.map((e) => e.value);
  const lengths = texts.map((t) => t.length);
  return {
    kind: 'text',
    type: column.type,
    total: responses.length,
    valid: entries.length,
    blank,
    unique: new Set(texts.map((t) => t)).size,
    duplicates: findDuplicates(texts).slice(0, 30),
    keywords: keywordFrequency(texts, { limit: 30 }),
    groups: clusterByTokens(entries, { threshold: 0.6 }),
    length: {
      min: minOf(lengths),
      max: maxOf(lengths),
      mean: round(mean(lengths), 1),
    },
    entries,
  };
}

function analyzeDate(column, responses, opts = {}) {
  const dayFirst = opts.dayFirst !== false;
  const dates = [];
  const invalid = [];
  let blank = 0;
  for (const r of responses) {
    const raw = r.values[column.id];
    if (isEmptyValue(raw)) {
      blank += 1;
      continue;
    }
    const d = responseDateAt(r, column.id, dayFirst);
    if (!d) invalid.push(String(raw));
    else dates.push(d);
  }
  const byDayMap = new Map();
  const byMonthMap = new Map();
  for (const d of dates) {
    const day = toDateKey(d);
    byDayMap.set(day, (byDayMap.get(day) || 0) + 1);
    const month = day.slice(0, 7);
    byMonthMap.set(month, (byMonthMap.get(month) || 0) + 1);
  }
  const times = dates.map((d) => d.getTime());
  return {
    kind: 'date',
    type: QTYPE.DATE,
    total: responses.length,
    valid: dates.length,
    blank,
    invalid: invalid.length,
    invalidSamples: invalid.slice(0, 50),
    min: minOf(times),
    max: maxOf(times),
    byDay: [...byDayMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key)),
    byMonth: [...byMonthMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function analyzeTime(column, responses, opts = {}) {
  const dayFirst = opts.dayFirst !== false;
  const byHour = new Array(24).fill(0);
  let valid = 0;
  let blank = 0;
  const invalid = [];
  for (const r of responses) {
    const raw = r.values[column.id];
    if (isEmptyValue(raw)) {
      blank += 1;
      continue;
    }
    const t = typeof raw === 'string' ? raw.match(/(\d{1,2}):(\d{2})/) : null;
    let hour = null;
    if (t) hour = +t[1];
    else {
      const d = responseDateAt(r, column.id, dayFirst);
      if (d) hour = d.getHours();
    }
    if (hour == null || hour < 0 || hour > 23) {
      invalid.push(String(raw));
      continue;
    }
    byHour[hour] += 1;
    valid += 1;
  }
  return {
    kind: 'time',
    type: QTYPE.TIME,
    total: responses.length,
    valid,
    blank,
    invalid: invalid.length,
    invalidSamples: invalid.slice(0, 50),
    byHour: byHour.map((count, hour) => ({ hour, count })),
  };
}

export function analyzeQuestion(column, responses, opts = {}) {
  if (column.type === QTYPE.DATE) return analyzeDate(column, responses, opts);
  if (column.type === QTYPE.TIME) return analyzeTime(column, responses, opts);
  if (SCALE_TYPES.has(column.type)) return analyzeScale(column, responses);
  if (column.type === QTYPE.GRID_MULTIPLE) return analyzeCategorical(column, responses, true);
  if (column.type === QTYPE.GRID_SINGLE) return analyzeCategorical(column, responses, false);
  if (column.type === QTYPE.MULTIPLE_CHOICE) return analyzeCategorical(column, responses, true);
  if (CHOICE_TYPES.has(column.type)) return analyzeCategorical(column, responses, false);
  if (TEXT_TYPES.has(column.type)) return analyzeTextQuestion(column, responses);
  return analyzeCategorical(column, responses, false);
}

export function analyzeGrid(columns, responses) {
  const rows = columns.map((col) => {
    const base = analyzeCategorical({ ...col, type: col.type === QTYPE.GRID_MULTIPLE ? QTYPE.MULTIPLE_CHOICE : QTYPE.SINGLE_CHOICE }, responses, col.type === QTYPE.GRID_MULTIPLE);
    return {
      columnId: col.id,
      label: col.header.replace(/\s*\[.*\]\s*$/, '').trim() || col.name,
      inner: col.header.match(/\[(.*)\]/)?.[1] || col.name,
      valid: base.valid,
      blank: base.blank,
      categories: base.categories,
    };
  });
  const choiceSet = new Map();
  for (const row of rows) {
    for (const c of row.categories) choiceSet.set(c.value, (choiceSet.get(c.value) || 0) + c.count);
  }
  const choices = [...choiceSet.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  return {
    kind: 'grid',
    type: columns[0]?.type || QTYPE.GRID_SINGLE,
    total: responses.length,
    rows,
    choices,
    columnIds: columns.map((c) => c.id),
  };
}

export function analyzeGroup(group, responses, opts = {}) {
  if (group.gridBase) return analyzeGrid(group.columns, responses);
  return analyzeQuestion(group.columns[0], responses, opts);
}

export function overallCompletion(dataset, responses) {
  const cols = includedColumns(dataset);
  const questionCount = cols.length;
  if (!responses.length || !questionCount) {
    return {
      responses: responses.length,
      questions: questionCount,
      avgAnsweredPercent: 0,
      fullyCompleted: 0,
      fullyCompletedPercent: 0,
      required: null,
    };
  }
  let totalAnswered = 0;
  let fullyCompleted = 0;
  for (const r of responses) {
    let answered = 0;
    for (const c of cols) {
      const v = r.values[c.id];
      if (!isEmptyValue(v) && !(Array.isArray(v) && v.length === 0)) answered += 1;
    }
    totalAnswered += answered;
    if (answered === questionCount) fullyCompleted += 1;
  }
  const avgAnsweredPercent = pct(totalAnswered, responses.length * questionCount);

  let required = null;
  if (dataset.requiredColumns && dataset.requiredColumns.length) {
    const reqIds = dataset.requiredColumns.filter((id) => cols.some((c) => c.id === id));
    if (reqIds.length) {
      let answeredCells = 0;
      for (const r of responses) {
        for (const id of reqIds) {
          const v = r.values[id];
          if (!isEmptyValue(v)) answeredCells += 1;
        }
      }
      required = {
        count: reqIds.length,
        percent: round(pct(answeredCells, responses.length * reqIds.length), 1),
      };
    }
  }

  return {
    responses: responses.length,
    questions: questionCount,
    avgAnsweredPercent: round(avgAnsweredPercent, 1),
    fullyCompleted,
    fullyCompletedPercent: round(pct(fullyCompleted, responses.length), 1),
    required,
  };
}

export function questionCompletion(column, responses) {
  let answered = 0;
  for (const r of responses) {
    const v = r.values[column.id];
    if (!isEmptyValue(v) && !(Array.isArray(v) && v.length === 0)) answered += 1;
  }
  return { answered, total: responses.length, percent: round(pct(answered, responses.length), 1) };
}

export const _internal = { analyzeCategorical, analyzeScale, analyzeTextQuestion };
