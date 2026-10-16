import { describe, it, expect } from 'vitest';
import {
  normalizeHeaderKey,
  validateSheetHeader,
  buildResponsesFromRows,
  computeSheetDiff,
  applySheetSync,
  backfillExternalIds,
} from '../src/integrations/syncEngine.js';
import { makeDataset, makeColumn, makeResponse } from '../src/core/model.js';
import { QTYPE } from '../src/core/constants.js';

function makeSheetDataset() {
  const c1 = makeColumn({ header: 'Mã phản hồi', type: QTYPE.TEXT });
  const c2 = makeColumn({ header: 'Giới tính', type: QTYPE.SINGLE_CHOICE });
  const c3 = makeColumn({ header: 'Điểm', type: QTYPE.LINEAR_SCALE });
  const dataset = makeDataset({
    columns: [c1, c2, c3],
    responseIdColumn: c1.id,
    source: { headerRowIndex: 0 },
  });
  return { dataset, c1, c2, c3 };
}

describe('normalizeHeaderKey (P0.1)', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeHeaderKey('  Giới   tính ')).toBe('giới tính');
    expect(normalizeHeaderKey('Giới\r\ntính')).toBe('giới tính');
    expect(normalizeHeaderKey(null)).toBe('');
    expect(normalizeHeaderKey(123)).toBe('123');
  });
});

describe('validateSheetHeader (P0.1)', () => {
  it('accepts an exact header row', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Mã phản hồi', 'Giới tính', 'Điểm'], ['1', 'Nam', '5']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(true);
    expect(v.columnMap).toEqual([0, 1, 2]);
    expect(v.ignoredColumns).toEqual([]);
  });

  it('remaps reordered columns by name instead of position', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Điểm', 'Mã phản hồi', 'Giới tính'], ['5', '1', 'Nam']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(true);
    expect(v.columnMap).toEqual([1, 2, 0]);
  });

  it('blocks when a configured column is missing from the sheet', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Mã phản hồi', 'Điểm'], ['1', '5']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('Giới tính');
  });

  it('blocks when the sheet duplicates a configured header', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Mã phản hồi', 'Giới tính', 'Giới tính'], ['1', 'Nam', 'Nữ']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/trùng tên/);
  });

  it('blocks when the saved configuration itself has duplicate headers', () => {
    const { dataset, c2 } = makeSheetDataset();
    dataset.columns = [...dataset.columns, makeColumn({ header: 'Giới tính', type: QTYPE.TEXT, id: c2.id + '_dup' })];
    const rows = [['Mã phản hồi', 'Giới tính', 'Giới tính', 'Điểm'], ['1', 'Nam', 'Nữ', '5']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/hai cột trùng tên/);
  });

  it('supports import-generated duplicate names (A / A (2)) against raw duplicate sheet headers', () => {
    const a = makeColumn({ header: 'A', type: QTYPE.TEXT });
    const a2 = makeColumn({ header: 'A (2)', type: QTYPE.TEXT });
    const dataset = makeDataset({ columns: [a, a2], source: { headerRowIndex: 0 } });
    const rows = [['A', 'A'], ['x', 'y']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(true);
    expect(v.columnMap).toEqual([0, 1]);
    const incoming = buildResponsesFromRows(dataset, rows, 0, v.columnMap);
    expect(incoming[0].values[a.id]).toBe('x');
    expect(incoming[0].values[a2.id]).toBe('y');
  });

  it('allows extra sheet columns and reports them as ignored', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Mã phản hồi', 'Giới tính', 'Điểm', 'Ghi chú mới'], ['1', 'Nam', '5', 'note']];
    const v = validateSheetHeader(dataset, rows, 0);
    expect(v.ok).toBe(true);
    expect(v.ignoredColumns).toEqual(['Ghi chú mới']);
  });

  it('no longer blocks on column-count mismatch alone (names decide)', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Mã phản hồi', 'Giới tính', 'Điểm', 'Cột mới'], ['1', 'Nam', '5', 'x']];
    expect(validateSheetHeader(dataset, rows, 0).ok).toBe(true);

    const rows2 = [['Giới tính', 'Mã phản hồi', 'Điểm', 'Cột mới'], ['Nam', '1', '5', 'x']];
    const v2 = validateSheetHeader(dataset, rows2, 0);
    expect(v2.ok).toBe(true);
    expect(v2.columnMap).toEqual([1, 0, 2]);
  });

  it('blocks when the header row is missing or out of range', () => {
    const { dataset } = makeSheetDataset();
    expect(validateSheetHeader(dataset, [], 0).ok).toBe(false);
    expect(validateSheetHeader(dataset, [['a', 'b']], 5).ok).toBe(false);
  });
});

describe('buildResponsesFromRows with columnMap (P0.1)', () => {
  it('reads cells by mapped position, including id and timestamp columns', () => {
    const { dataset } = makeSheetDataset();
    const ts = makeColumn({ header: 'Thời gian', type: QTYPE.DATE });
    dataset.columns.push(ts);
    dataset.timestampColumn = ts.id;
    dataset.source.headerRowIndex = 1;

    const rows = [
      ['phụ'],
      ['Điểm', 'Mã phản hồi', 'Thời gian', 'Giới tính'],
      ['5', 'R-1', '2025-06-01T10:30:00', 'Nữ'],
    ];
    const v = validateSheetHeader(dataset, rows, 1);
    expect(v.ok).toBe(true);
    const [incoming] = buildResponsesFromRows(dataset, rows, 1, v.columnMap);
    expect(incoming.externalId).toBe('R-1');
    expect(incoming.submittedAt).toBe(new Date('2025-06-01T10:30:00').getTime());
    expect(incoming.values[dataset.columns[1].id]).toBe('Nữ');
    expect(incoming.values[dataset.columns[2].id]).toBe('5');
  });

  it('never reads cells beyond the sheet row', () => {
    const { dataset } = makeSheetDataset();
    const rows = [['Mã phản hồi', 'Giới tính', 'Điểm'], ['1']];
    const v = validateSheetHeader(dataset, rows, 0);
    const [incoming] = buildResponsesFromRows(dataset, rows, 0, v.columnMap);
    expect(incoming.values[dataset.columns[1].id]).toBeNull();
    expect(incoming.values[dataset.columns[2].id]).toBeNull();
  });
});

describe('externalId backfill and safe diffs (P0.2)', () => {
  function legacyDataset() {
    const { dataset, c1, c2, c3 } = makeSheetDataset();
    const legacy = makeResponse({ [c1.id]: 'X-1', [c2.id]: 'Nam', [c3.id]: 5 });
    expect(legacy.id).not.toBe('X-1');
    expect(legacy.externalId).toBeNull();
    dataset.responses = [legacy];
    return { dataset, c1, c2, c3, legacy };
  }

  it('backfills externalId from the configured id column', () => {
    const { dataset, legacy } = legacyDataset();
    const [filled] = backfillExternalIds(dataset, dataset.responses);
    expect(filled.externalId).toBe('X-1');
    expect(filled.id).toBe(legacy.id);
    expect(filled.values).toEqual(legacy.values);
  });

  it('updates a legacy response by id instead of removing and re-adding it', () => {
    const { dataset, c1, c2, c3, legacy } = legacyDataset();
    const incoming = [{ values: { [c1.id]: 'X-1', [c2.id]: 'Nữ', [c3.id]: 5 }, externalId: 'X-1', submittedAt: null }];
    const diff = computeSheetDiff(dataset, incoming);
    expect(diff.updatedCount).toBe(1);
    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);
    expect(diff.idDomainUnsafe).toBe(false);

    const { responses } = applySheetSync(dataset, incoming);
    expect(responses).toHaveLength(1);
    expect(responses[0].id).toBe(legacy.id);
    expect(responses[0].values[c2.id]).toBe('Nữ');
    expect(responses[0].externalId).toBe('X-1');
  });

  it('flags a full id-domain change as unsafe with matched/added/removed counts', () => {
    const { dataset, c1, c2, c3 } = makeSheetDataset();
    dataset.responses = [
      makeResponse({ [c1.id]: 'a', [c2.id]: 'Nam', [c3.id]: 1 }, { id: 'a', externalId: 'a' }),
      makeResponse({ [c1.id]: 'b', [c2.id]: 'Nữ', [c3.id]: 2 }, { id: 'b', externalId: 'b' }),
    ];
    const incoming = [
      { values: { [c1.id]: 'c', [c2.id]: 'Nam', [c3.id]: 3 }, externalId: 'c', submittedAt: null },
      { values: { [c1.id]: 'd', [c2.id]: 'Nữ', [c3.id]: 4 }, externalId: 'd', submittedAt: null },
    ];
    const diff = computeSheetDiff(dataset, incoming);
    expect(diff.matchedCount).toBe(0);
    expect(diff.idDomainUnsafe).toBe(true);
    expect(diff.addedCount).toBe(2);
    expect(diff.removedCount).toBe(2);
    expect(diff.unidentifiedCount).toBe(0);
  });

  it('is not unsafe when at least one id still matches', () => {
    const { dataset, c1, c2, c3 } = makeSheetDataset();
    dataset.responses = [
      makeResponse({ [c1.id]: 'a', [c2.id]: 'Nam', [c3.id]: 1 }, { id: 'a', externalId: 'a' }),
      makeResponse({ [c1.id]: 'b', [c2.id]: 'Nữ', [c3.id]: 2 }, { id: 'b', externalId: 'b' }),
    ];
    const incoming = [
      { values: { [c1.id]: 'a', [c2.id]: 'Nam', [c3.id]: 1 }, externalId: 'a', submittedAt: null },
      { values: { [c1.id]: 'c', [c2.id]: 'Nữ', [c3.id]: 3 }, externalId: 'c', submittedAt: null },
    ];
    const diff = computeSheetDiff(dataset, incoming);
    expect(diff.matchedCount).toBe(1);
    expect(diff.idDomainUnsafe).toBe(false);
    expect(diff.addedCount).toBe(1);
    expect(diff.toRemove).toHaveLength(1);
  });

  it('is not unsafe when the sheet is emptied (legitimate removal)', () => {
    const { dataset, c1 } = makeSheetDataset();
    dataset.responses = [makeResponse({ [c1.id]: 'a' }, { id: 'a', externalId: 'a' })];
    const diff = computeSheetDiff(dataset, []);
    expect(diff.idDomainUnsafe).toBe(false);
    expect(diff.removedCount).toBe(1);
  });

  it('falls back to content matching when ids are duplicated, without collapsing rows', () => {
    const { dataset, c1, c2, c3 } = makeSheetDataset();
    dataset.responses = [
      makeResponse({ [c1.id]: 'dup', [c2.id]: 'Nam', [c3.id]: 1 }, { id: 'row1', externalId: 'dup' }),
      makeResponse({ [c1.id]: 'dup', [c2.id]: 'Nữ', [c3.id]: 2 }, { id: 'row2', externalId: 'dup' }),
    ];
    const incoming = [
      { values: { [c1.id]: 'dup', [c2.id]: 'Nam', [c3.id]: 1 }, externalId: 'dup', submittedAt: null },
      { values: { [c1.id]: 'dup', [c2.id]: 'Nữ', [c3.id]: 2 }, externalId: 'dup', submittedAt: null },
    ];
    const diff = computeSheetDiff(dataset, incoming);
    expect(diff.fallbackReason).toBe('duplicate_ids');
    expect(diff.warnings.length).toBeGreaterThan(0);
    expect(diff.unchangedCount).toBe(2);
    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);

    const { responses } = applySheetSync(dataset, incoming);
    expect(responses).toHaveLength(2);
    expect(responses.map((r) => r.id).sort()).toEqual(['row1', 'row2']);
  });

  it('content-matches id-less rows so they are not re-added every sync', () => {
    const { dataset, c1, c2, c3 } = makeSheetDataset();
    dataset.responses = [
      makeResponse({ [c1.id]: null, [c2.id]: 'Nam', [c3.id]: 1 }),
      makeResponse({ [c1.id]: null, [c2.id]: 'Nữ', [c3.id]: 2 }),
    ];
    const incoming = [
      { values: { [c1.id]: null, [c2.id]: 'Nam', [c3.id]: 1 }, externalId: null, submittedAt: null },
      { values: { [c1.id]: null, [c2.id]: 'Nữ', [c3.id]: 2 }, externalId: null, submittedAt: null },
    ];
    const diff = computeSheetDiff(dataset, incoming);
    expect(diff.unchangedCount).toBe(2);
    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);
    expect(diff.idDomainUnsafe).toBe(false);
  });

  it('removes an id-less stored row that disappeared from the sheet', () => {
    const { dataset, c1, c2 } = makeSheetDataset();
    dataset.responses = [
      makeResponse({ [c1.id]: null, [c2.id]: 'Nam' }),
      makeResponse({ [c1.id]: null, [c2.id]: 'Nữ' }),
    ];
    const incoming = [{ values: { [c1.id]: null, [c2.id]: 'Nam' }, externalId: null, submittedAt: null }];
    const diff = computeSheetDiff(dataset, incoming);
    expect(diff.unchangedCount).toBe(1);
    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(0);
  });

  it('keeps diff output JSON-serializable for sync.lastResult', () => {
    const { dataset, c1, c2, c3 } = makeSheetDataset();
    dataset.responses = [makeResponse({ [c1.id]: 'a', [c2.id]: 'Nam', [c3.id]: 1 }, { id: 'a', externalId: 'a' })];
    const incoming = [{ values: { [c1.id]: 'a', [c2.id]: 'Nữ', [c3.id]: 1 }, externalId: 'a', submittedAt: null }];
    const diff = computeSheetDiff(dataset, incoming);
    expect(() => JSON.stringify(diff)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(diff));
    expect(parsed.updatedCount).toBe(1);
    expect(parsed.idDomainUnsafe).toBe(false);
  });

  it('caches parsed dates on incoming rows honouring dateMeta (P1.1)', () => {
    const dateCol = makeColumn({ header: 'Ngày', type: QTYPE.DATE });
    const dataset = makeDataset({
      columns: [dateCol],
      source: { headerRowIndex: 0 },
      dateMeta: { dayFirst: false },
    });
    const rows = [['Ngày'], ['05/03/2024']];
    const [incoming] = buildResponsesFromRows(dataset, rows, 0);
    expect(incoming.dates[dateCol.id]).toBe(new Date(2024, 4, 3).getTime());
  });
});
