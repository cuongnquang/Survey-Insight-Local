import { isEmptyValue, makeColumn, makeDataset, makeResponse, genId } from '../core/model.js';
import { toKey, parseNumber } from '../core/values.js';
import { parseDate } from '../core/dates.js';
import { detectColumnType, detectGridGroups, computeOptions } from './detect.js';
import { QTYPE, SCALE_TYPES } from '../core/constants.js';

export function nonEmptyCount(row) {
  return (row || []).filter((c) => !isEmptyValue(c)).length;
}

export function detectHeaderRow(rows) {
  let best = 0;
  let bestScore = -Infinity;
  const limit = Math.min(rows.length, 12);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] || [];
    const ne = nonEmptyCount(row);
    if (ne < 2) continue;
    const unique = new Set(row.map((c) => toKey(c)).filter(Boolean)).size;
    // Hàng tiêu đề thật phải có các tên cột phân biệt; hàng bị gộp ô (mọi ô
    // giống nhau) hoặc hàng dữ liệu lặp lại không được chọn làm tiêu đề.
    if (unique < 2) continue;
    const strCells = row.filter((c) => !isEmptyValue(c) && typeof c === 'string').length;
    const score = ne + strCells * 0.6 + unique * 0.4 - i * 0.9;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function uniqueHeaders(rawHeaders) {
  const used = new Set();
  return rawHeaders.map((h, i) => {
    const base = isEmptyValue(h) ? `Cột ${i + 1}` : String(h).trim();
    let name = base;
    let n = 1;
    while (used.has(name)) {
      n += 1;
      name = `${base} (${n})`;
    }
    used.add(name);
    return name;
  });
}

export function buildRawTable(rows, headerRowIndex) {
  const headerRow = rows[headerRowIndex] || [];
  const headers = uniqueHeaders(headerRow);
  const dataRows = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (nonEmptyCount(row) === 0) continue;
    const padded = headers.map((_, ci) => (ci < row.length ? row[ci] : null));
    dataRows.push(padded);
  }
  return { headerRowIndex, headers, dataRows };
}

export function suggestIdColumn(headers) {
  const idx = headers.findIndex((h) =>
    /(response\s*id|mã phản hồi|ma phan hoi|^id$|submission\s*id)/i.test(h)
  );
  return idx >= 0 ? headers[idx] : null;
}

export function suggestTimestampColumn(headers) {
  const idx = headers.findIndex((h) =>
    /(timestamp|thời gian|thoi gian|dấu thời gian|dau thoi gian|submitted|ngày gửi|ngay gui|date submitted)/i.test(h)
  );
  return idx >= 0 ? headers[idx] : null;
}

export function buildColumnSpecs(headers, dataRows, { sampleLimit = 250, dayFirst = true } = {}) {
  const gridGroups = detectGridGroups(headers);
  const gridBaseByHeader = new Map();
  for (const [base, items] of gridGroups) {
    for (const it of items) gridBaseByHeader.set(it.header, base);
  }

  return headers.map((header, ci) => {
    const samples = [];
    for (const row of dataRows) {
      const v = row[ci];
      if (isEmptyValue(v)) continue;
      samples.push(v);
      if (samples.length >= sampleLimit) break;
    }
    const det = detectColumnType(header, samples, { dayFirst });
    const gridBase = gridBaseByHeader.get(header) || null;
    let type = det.type;
    if (gridBase) {
      type = det.type === QTYPE.MULTIPLE_CHOICE ? QTYPE.GRID_MULTIPLE : QTYPE.GRID_SINGLE;
    }
    // Biên của thang điểm phải tính trên toàn bộ dữ liệu, không chỉ mẫu,
    // nếu không các giá trị hợp lệ nằm ngoài mẫu sẽ bị coi là không hợp lệ.
    let scale = det.scale;
    if (scale && SCALE_TYPES.has(det.type)) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const row of dataRows) {
        const n = parseNumber(row[ci]);
        if (n == null) continue;
        if (n < lo) lo = n;
        if (n > hi) hi = n;
      }
      if (Number.isFinite(lo) && Number.isFinite(hi)) scale = { min: lo, max: hi };
    }
    return makeColumn({
      header,
      name: header,
      type,
      separator: det.separator,
      customSeparator: det.customSeparator,
      scale,
      options: det.options,
      sampleValues: samples.slice(0, 8).map((s) => String(s)),
      gridBase,
      notes: det.reasons.join(' '),
    });
  });
}

export function recomputeColumnOptions(header, dataRows, columnIndex, separator, customSeparator) {
  const samples = [];
  for (const row of dataRows) {
    const v = row[columnIndex];
    if (isEmptyValue(v)) continue;
    samples.push(v);
    if (samples.length >= 400) break;
  }
  return computeOptions(samples, separator, customSeparator);
}

export function buildDataset({
  name,
  source,
  rawTable,
  columnSpecs,
  responseIdHeader,
  timestampHeader,
  dayFirst = true,
}) {
  const columns = columnSpecs.map(makeColumn);
  const idCol = columns.find((c) => c.header === responseIdHeader) || null;
  const tsCol = columns.find((c) => c.header === timestampHeader) || null;
  const responseIdColumn = idCol ? idCol.id : null;
  const timestampColumn = tsCol ? tsCol.id : null;
  const dateColumns = columns.filter((c) => c.type === QTYPE.DATE);
  const datedColumnIds = new Set([...dateColumns.map((c) => c.id), ...(tsCol ? [tsCol.id] : [])]);

  const responses = rawTable.dataRows.map((row) => {
    const values = {};
    const dates = {};
    columns.forEach((col, ci) => {
      const raw = ci < row.length ? row[ci] : null;
      values[col.id] = raw;
      if (datedColumnIds.has(col.id)) {
        const d = parseDate(raw, { dayFirst });
        dates[col.id] = d ? d.getTime() : null;
      }
    });
    let id;
    if (idCol) {
      const ci = columns.indexOf(idCol);
      const raw = row[ci];
      if (!isEmptyValue(raw)) id = String(raw).trim();
    }
    let submittedAt = null;
    if (tsCol) {
      const cached = dates[tsCol.id];
      if (cached != null) submittedAt = cached;
      else {
        const d = parseDate(row[columns.indexOf(tsCol)], { dayFirst });
        if (d) submittedAt = d.getTime();
      }
    }
    return makeResponse(values, { id, submittedAt, externalId: id ?? null, dates });
  });

  return makeDataset({
    id: genId('ds'),
    name,
    source,
    columns,
    responses,
    responseIdColumn,
    timestampColumn,
    dateMeta: { dayFirst },
  });
}
