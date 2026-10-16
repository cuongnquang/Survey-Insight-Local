import { makeResponse, isEmptyValue, includedColumns } from '../core/model.js';
import { parseDate } from '../core/dates.js';
import { QTYPE } from '../core/constants.js';
import { computeSyncDiff, applySyncDiff } from './sync.js';

function norm(v) {
  if (v == null) return '\u0000';
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\r\n/g, '\n').trim();
}

export function normalizeHeaderKey(v) {
  if (v == null) return '';
  return String(v)
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function columnKeys(col) {
  const keys = [];
  const push = (v) => {
    const k = normalizeHeaderKey(v);
    if (k && !keys.includes(k)) keys.push(k);
  };
  push(col.header);
  push(col.name);
  return keys;
}

function duplicateSuffix(key) {
  const m = /^(.*) \((\d+)\)$/.exec(key);
  return m ? m[1] : null;
}

/**
 * Validate the sheet header row against the saved dataset configuration and
 * build a name-based column map (dataset column index -> sheet column index).
 *
 * Never falls back to positional mapping: a missing, renamed or duplicated
 * header aborts the sync before anything is written, so sheet data cannot be
 * assigned to the wrong column.
 */
export function validateSheetHeader(dataset, rows, headerRowIndex = dataset.source?.headerRowIndex ?? 0) {
  const cols = dataset.columns || [];
  const sheetHeader = rows[headerRowIndex] || [];
  if (sheetHeader.length === 0) {
    return { ok: false, reason: 'Không tìm thấy hàng tiêu đề trong sheet.', columnMap: [], ignoredColumns: [] };
  }
  const sheetKeys = sheetHeader.map(normalizeHeaderKey);

  const colKeySets = cols.map(columnKeys);
  const primaryKeys = colKeySets.map((ks) => ks[0] || '');
  const seen = new Map();
  for (let i = 0; i < primaryKeys.length; i += 1) {
    const k = primaryKeys[i];
    if (!k) continue;
    if (seen.has(k)) {
      const label = cols[i].name || cols[i].header;
      return {
        ok: false,
        reason: `Cấu hình có hai cột trùng tên “${label}” sau khi chuẩn hóa. Hãy đổi tên cột trong cấu hình trước khi đồng bộ.`,
        columnMap: [],
        ignoredColumns: [],
      };
    }
    seen.set(k, i);
  }

  const usedSheet = new Set();
  const columnMap = new Array(cols.length).fill(-1);
  const missing = [];

  for (let ci = 0; ci < cols.length; ci += 1) {
    const keys = colKeySets[ci];
    let matches = [];
    for (const k of keys) {
      matches = sheetKeys
        .map((sk, si) => (sk === k && !usedSheet.has(si) ? si : -1))
        .filter((si) => si >= 0);
      if (matches.length) break;
    }
    if (!matches.length) {
      const base = duplicateSuffix(primaryKeys[ci]);
      if (base && primaryKeys.includes(base)) {
        matches = sheetKeys
          .map((sk, si) => (sk === base && !usedSheet.has(si) ? si : -1))
          .filter((si) => si >= 0);
      }
    }
    if (matches.length > 1) {
      const k = primaryKeys[ci];
      const base = duplicateSuffix(k) || k;
      let claimants = 1;
      for (let j = ci + 1; j < cols.length; j += 1) {
        const pk = primaryKeys[j];
        if (pk === k || duplicateSuffix(pk) === base) claimants += 1;
      }
      if (claimants < matches.length) {
        const label = cols[ci].name || cols[ci].header;
        return {
          ok: false,
          reason: `Sheet có ${matches.length} cột trùng tên “${label}” — không xác định được cột nào chứa đúng dữ liệu. Đồng bộ bị hủy.`,
          columnMap: [],
          ignoredColumns: [],
        };
      }
    }
    if (matches.length >= 1) {
      columnMap[ci] = matches[0];
      usedSheet.add(matches[0]);
    } else {
      missing.push(`“${cols[ci].name || cols[ci].header}”`);
    }
  }

  if (missing.length) {
    return {
      ok: false,
      reason: `Sheet không còn các cột: ${missing.join(', ')}. Đồng bộ bị hủy để tránh ghi dữ liệu vào sai cột — kiểm tra lại bảng tính hoặc nhập lại bộ dữ liệu.`,
      columnMap,
      ignoredColumns: [],
    };
  }

  const ignoredColumns = sheetHeader.filter((_, si) => !usedSheet.has(si));
  return { ok: true, columnMap, ignoredColumns, sheetHeader };
}

/**
 * Backfill `externalId` on stored responses from the configured id column so
 * responses imported before an id column was chosen (or created by an older
 * sync) can still be matched by id instead of being removed and re-added.
 */
export function backfillExternalIds(dataset, responses) {
  if (!dataset.responseIdColumn) return responses;
  let changed = false;
  const next = responses.map((r) => {
    if (r.externalId != null || r.externalId === '') return r;
    const v = r.values?.[dataset.responseIdColumn];
    if (isEmptyValue(v)) return r;
    changed = true;
    return { ...r, externalId: String(v).trim() };
  });
  return changed ? next : responses;
}

export function buildResponsesFromRows(
  dataset,
  rows,
  headerRowIndex = dataset.source?.headerRowIndex ?? 0,
  columnMap = null,
  dayFirst = dataset.dateMeta?.dayFirst !== false
) {
  const cols = dataset.columns || [];
  const sheetIdx = (ci) => {
    if (columnMap && columnMap[ci] != null && columnMap[ci] >= 0) return columnMap[ci];
    return ci;
  };
  const idCi = dataset.responseIdColumn ? cols.findIndex((c) => c.id === dataset.responseIdColumn) : -1;
  const tsCi = dataset.timestampColumn ? cols.findIndex((c) => c.id === dataset.timestampColumn) : -1;
  const idIdx = idCi >= 0 ? sheetIdx(idCi) : -1;
  const tsIdx = tsCi >= 0 ? sheetIdx(tsCi) : -1;
  const datedCols = cols.filter((c) => c.type === QTYPE.DATE || c.id === dataset.timestampColumn);
  const start = Math.max(0, Number.isFinite(headerRowIndex) ? headerRowIndex : 0) + 1;

  const incoming = [];
  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (row.every((c) => isEmptyValue(c))) continue;
    const values = {};
    const dates = {};
    cols.forEach((c, ci) => {
      const si = sheetIdx(ci);
      values[c.id] = si >= 0 && si < row.length ? row[si] : null;
    });
    for (const c of datedCols) {
      const d = parseDate(values[c.id], { dayFirst });
      dates[c.id] = d ? d.getTime() : null;
    }
    const externalId = idIdx >= 0 && !isEmptyValue(row[idIdx]) ? String(row[idIdx]).trim() : null;
    let submittedAt = null;
    if (tsCi >= 0) {
      if (dates[dataset.timestampColumn] != null) submittedAt = dates[dataset.timestampColumn];
      else if (tsIdx >= 0) {
        const d = parseDate(row[tsIdx], { dayFirst });
        if (d) submittedAt = d.getTime();
      }
    }
    incoming.push({ values, externalId, submittedAt, dates });
  }
  return incoming;
}

export function computeSheetDiff(dataset, incoming) {
  const colIds = includedColumns(dataset).map((c) => c.id);
  const hasStableId = !!dataset.responseIdColumn;
  const existing = backfillExternalIds(dataset, dataset.responses);
  const idOf = hasStableId ? (r) => r.externalId ?? null : () => null;
  const signatureOf = (r) => colIds.map((id) => norm(r.values?.[id])).join('\u0001');
  return computeSyncDiff(existing, incoming, { columnIds: colIds, idOf, signatureOf });
}

export function applySheetSync(dataset, incoming) {
  const diff = computeSheetDiff(dataset, incoming);
  const hasStableId = !!dataset.responseIdColumn;
  const existing = backfillExternalIds(dataset, dataset.responses);
  const responses = applySyncDiff(existing, diff, {
    makeResponse: (r) =>
      makeResponse(r.values, {
        id: hasStableId && r.externalId ? r.externalId : undefined,
        externalId: r.externalId ?? null,
        submittedAt: r.submittedAt || null,
        dates: r.dates || null,
      }),
    cloneResponse: (prev, incomingRow) => ({
      ...prev,
      externalId: incomingRow.externalId ?? prev.externalId ?? null,
      values: incomingRow.values,
      dates: incomingRow.dates || prev.dates,
      submittedAt: incomingRow.submittedAt || prev.submittedAt || null,
    }),
  });
  return { diff, responses };
}
