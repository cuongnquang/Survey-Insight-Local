import { describe, it, expect } from 'vitest';
import {
  detectHeaderRow,
  buildRawTable,
  buildColumnSpecs,
  suggestIdColumn,
  suggestTimestampColumn,
  buildDataset,
} from '../src/import/normalize.js';
import { analyzeQuestion } from '../src/analysis/analyze.js';
import { QTYPE } from '../src/core/constants.js';

const rows = [
  ['Báo cáo khảo sát 2024'],
  [],
  ['Mã phản hồi', 'Thời gian', 'Họ tên', 'Số sao đánh giá'],
  ['R001', '2024-01-05', 'An', '5'],
  ['R002', '2024-01-06', 'Bình', '4'],
  ['R003', '2024-01-07', 'Chi', '3'],
];

describe('detectHeaderRow', () => {
  it('finds the header row among leading noise', () => {
    expect(detectHeaderRow(rows)).toBe(2);
  });

  it('skips a merged/repeated row in favour of the real header row (M6)', () => {
    const rowsWithNoise = [
      ['Báo cáo khảo sát 2024'],
      ['Báo cáo', 'Báo cáo'],
      ['Họ tên', 'Tuổi'],
      ['An', '30'],
    ];
    expect(detectHeaderRow(rowsWithNoise)).toBe(2);
  });
});

describe('buildRawTable', () => {
  it('builds unique headers and skips empty rows', () => {
    const t = buildRawTable(rows, 2);
    expect(t.headers).toEqual(['Mã phản hồi', 'Thời gian', 'Họ tên', 'Số sao đánh giá']);
    expect(t.dataRows.length).toBe(3);
  });

  it('deduplicates repeated headers', () => {
    const t = buildRawTable([['A', 'A']], 0);
    expect(t.headers).toEqual(['A', 'A (2)']);
  });

  it('never emits colliding headers when a raw header already matches a generated suffix (M5)', () => {
    const t = buildRawTable([['A', 'A', 'A (2)']], 0);
    expect(new Set(t.headers).size).toBe(t.headers.length);
    expect(t.headers[0]).toBe('A');
  });
});

describe('suggestIdColumn / suggestTimestampColumn', () => {
  it('detects id and timestamp headers', () => {
    expect(suggestIdColumn(['Mã phản hồi', 'Họ tên'])).toBe('Mã phản hồi');
    expect(suggestTimestampColumn(['Mã phản hồi', 'Thời gian'])).toBe('Thời gian');
  });
});

describe('buildColumnSpecs', () => {
  it('detects a grid group from bracket headers', () => {
    const headers = ['Q [A]', 'Q [B]'];
    const dataRows = [['Có', 'Không'], ['Có', 'Có']];
    const specs = buildColumnSpecs(headers, dataRows);
    expect(specs[0].gridBase).toBe('Q');
    expect(specs[0].type).toBe(QTYPE.GRID_SINGLE);
    expect(specs[1].gridBase).toBe('Q');
  });

  it('detects scale columns', () => {
    const specs = buildColumnSpecs(['Số sao đánh giá'], [['5'], ['4'], ['3'], ['2']]);
    expect([QTYPE.RATING, QTYPE.LINEAR_SCALE]).toContain(specs[0].type);
  });

  it('computes scale bounds from the full data, not just the sample (M4)', () => {
    const dataRows = [['5'], ['4'], ['3'], ['2'], ['1']];
    const specs = buildColumnSpecs(['Số sao đánh giá'], dataRows, { sampleLimit: 2 });
    expect([QTYPE.RATING, QTYPE.LINEAR_SCALE]).toContain(specs[0].type);
    expect(specs[0].scale).toEqual({ min: 1, max: 5 });
  });
});

describe('analyzeScale with full-data bounds (M4)', () => {
  it('does not flag values that were outside the detection sample as invalid', () => {
    const table = buildRawTable([['Số sao đánh giá'], ['5'], ['4'], ['1']], 0);
    const specs = buildColumnSpecs(table.headers, table.dataRows, { sampleLimit: 1 });
    const dataset = buildDataset({ name: 'x', source: {}, rawTable: table, columnSpecs: specs });
    const col = dataset.columns[0];
    const analysis = analyzeQuestion(col, dataset.responses);
    expect(analysis.kind).toBe('scale');
    expect(analysis.invalid).toBe(0);
    expect(analysis.valid).toBe(3);
  });
});

describe('buildDataset', () => {
  it('wires response id and timestamp columns and builds responses', () => {
    const table = buildRawTable(rows, 2);
    const specs = buildColumnSpecs(table.headers, table.dataRows);
    const dataset = buildDataset({
      name: 'Khảo sát test',
      source: { type: 'file', fileName: 'test.xlsx' },
      rawTable: table,
      columnSpecs: specs,
      responseIdHeader: 'Mã phản hồi',
      timestampHeader: 'Thời gian',
    });
    expect(dataset.columns.length).toBe(4);
    expect(dataset.responses.length).toBe(3);
    expect(dataset.responseIdColumn).toBeTruthy();
    expect(dataset.timestampColumn).toBeTruthy();
    const first = dataset.responses[0];
    expect(first.id).toBe('R001');
    expect(first.submittedAt).toBeTypeOf('number');
  });

  it('captures dateMeta and per-response parsed dates (P1.1)', () => {
    const table = buildRawTable(rows, 2);
    const specs = buildColumnSpecs(table.headers, table.dataRows);
    const dataset = buildDataset({
      name: 'Khảo sát test',
      source: { type: 'file', fileName: 'test.xlsx' },
      rawTable: table,
      columnSpecs: specs,
      responseIdHeader: 'Mã phản hồi',
      timestampHeader: 'Thời gian',
      dayFirst: false,
    });
    expect(dataset.dateMeta).toEqual({ dayFirst: false });
    const first = dataset.responses[0];
    expect(first.dates).toBeTruthy();
    expect(first.dates[dataset.timestampColumn]).toBe(new Date(2024, 0, 5).getTime());
  });

  it('honours dayFirst when caching ambiguous dates', () => {
    const amb = [['Ngày'], ['05/03/2024']];
    const table = buildRawTable(amb, 0);
    const specs = buildColumnSpecs(table.headers, table.dataRows);
    const dayFirst = buildDataset({ name: 'x', source: {}, rawTable: table, columnSpecs: specs, dayFirst: true });
    const monthFirst = buildDataset({ name: 'x', source: {}, rawTable: table, columnSpecs: specs, dayFirst: false });
    const dateCol = dayFirst.columns.find((c) => c.type === QTYPE.DATE);
    expect(dayFirst.responses[0].dates[dateCol.id]).toBe(new Date(2024, 2, 5).getTime());
    const dateCol2 = monthFirst.columns.find((c) => c.type === QTYPE.DATE);
    expect(monthFirst.responses[0].dates[dateCol2.id]).toBe(new Date(2024, 4, 3).getTime());
  });
});
