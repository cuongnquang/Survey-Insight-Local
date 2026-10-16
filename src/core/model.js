import { QTYPE } from './constants.js';

let counter = 0;

export function genId(prefix = 'id') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`;
}

export function isEmptyValue(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

export function toDisplayString(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

export function makeColumn(spec = {}) {
  return {
    id: spec.id || genId('col'),
    header: spec.header ?? '',
    name: spec.name ?? spec.header ?? '',
    type: spec.type || QTYPE.UNKNOWN,
    included: spec.included !== false,
    separator: spec.separator || 'comma',
    customSeparator: spec.customSeparator || '',
    scale: spec.scale || null,
    options: spec.options ? [...spec.options] : [],
    sampleValues: spec.sampleValues ? [...spec.sampleValues] : [],
    gridBase: spec.gridBase || null,
    notes: spec.notes || '',
  };
}

export function makeResponse(values, { id, submittedAt, externalId, dates } = {}) {
  const response = {
    id: id || genId('row'),
    externalId: externalId ?? null,
    values: values || {},
    submittedAt: submittedAt || null,
  };
  if (dates && Object.keys(dates).length) response.dates = dates;
  return response;
}

export function makeDataset(spec = {}) {
  const now = Date.now();
  return {
    id: spec.id || genId('ds'),
    name: spec.name || 'Khảo sát chưa đặt tên',
    source: {
      type: 'file',
      fileName: '',
      sheetName: '',
      spreadsheetId: '',
      spreadsheetUrl: '',
      importedAt: now,
      ...(spec.source || {}),
    },
    columns: (spec.columns || []).map(makeColumn),
    responses: spec.responses || [],
    responseIdColumn: spec.responseIdColumn || null,
    timestampColumn: spec.timestampColumn || null,
    dateMeta: spec.dateMeta || null,
    requiredColumns: spec.requiredColumns || [],
    sync: spec.sync || {
      enabled: false,
      intervalMinutes: 15,
      lastSyncAt: null,
      nextSyncAt: null,
      lastResult: null,
    },
    createdAt: spec.createdAt || now,
    updatedAt: spec.updatedAt || now,
  };
}

export function includedColumns(dataset) {
  return (dataset?.columns || []).filter((c) => c.included);
}

export function getColumn(dataset, columnId) {
  return (dataset?.columns || []).find((c) => c.id === columnId) || null;
}

export function countAnswered(response, columnIds) {
  let n = 0;
  for (const id of columnIds) {
    const v = response.values[id];
    if (!isEmptyValue(v) && !(Array.isArray(v) && v.length === 0)) n += 1;
  }
  return n;
}
