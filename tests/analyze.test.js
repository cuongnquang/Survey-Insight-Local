import { describe, it, expect } from 'vitest';
import { buildQuestionGroups, analyzeQuestion, analyzeGrid, analyzeGroup, overallCompletion } from '../src/analysis/analyze.js';
import { makeColumn, makeDataset, makeResponse } from '../src/core/model.js';
import { QTYPE } from '../src/core/constants.js';

const responses = (values) => values.map((v) => makeResponse(v));

describe('buildQuestionGroups', () => {
  it('keeps grid group ids unique when two bases slug to the same value', () => {
    const a = makeColumn({ id: 'a', header: 'Câu 1! [X]', name: 'Câu 1!', gridBase: 'Câu 1!', type: QTYPE.GRID_SINGLE });
    const b = makeColumn({ id: 'b', header: 'Câu 1? [Y]', name: 'Câu 1?', gridBase: 'Câu 1?', type: QTYPE.GRID_SINGLE });
    const dataset = makeDataset({ columns: [a, b] });
    const groups = buildQuestionGroups(dataset);
    const ids = groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('analyzeQuestion — categorical', () => {
  const col = makeColumn({ id: 'q1', name: 'Màu', type: QTYPE.SINGLE_CHOICE, separator: 'comma' });
  const data = responses([
    { q1: 'đỏ' }, { q1: 'đỏ' }, { q1: 'xanh' }, { q1: '' }, { q1: null },
  ]);
  it('counts valid, blank and categories', () => {
    const a = analyzeQuestion(col, data);
    expect(a.kind).toBe('categorical');
    expect(a.valid).toBe(3);
    expect(a.blank).toBe(2);
    expect(a.categories[0]).toEqual({ value: 'đỏ', count: 2, pct: 66.7 });
  });
});

describe('analyzeQuestion — grid column types (M7)', () => {
  it('treats a standalone GRID_MULTIPLE column as multi-select', () => {
    const col = makeColumn({ id: 'g', name: 'Lưới', type: QTYPE.GRID_MULTIPLE, separator: 'comma' });
    const a = analyzeQuestion(col, responses([{ g: 'a, b' }, { g: 'a' }]));
    expect(a.multi).toBe(true);
    expect(a.kind).toBe('categorical');
  });

  it('treats a standalone GRID_SINGLE column as single-select', () => {
    const col = makeColumn({ id: 'g2', name: 'Lưới', type: QTYPE.GRID_SINGLE, separator: 'comma' });
    const a = analyzeQuestion(col, responses([{ g2: 'a' }, { g2: 'a' }, { g2: 'b' }]));
    expect(a.multi).toBe(false);
    expect(a.kind).toBe('categorical');
  });
});

describe('analyzeQuestion — multiple choice', () => {
  const col = makeColumn({ id: 'q2', name: 'Sở thích', type: QTYPE.MULTIPLE_CHOICE, separator: 'comma' });
  const data = responses([{ q2: 'a, b' }, { q2: 'b, c' }, { q2: 'b' }]);
  it('computes percentages over valid respondents (may exceed 100%)', () => {
    const a = analyzeQuestion(col, data);
    expect(a.multi).toBe(true);
    expect(a.valid).toBe(3);
    const sumPct = a.categories.reduce((s, c) => s + c.pct, 0);
    expect(sumPct).toBeGreaterThan(100);
    expect(a.note).toMatch(/100%/);
  });
});

describe('analyzeQuestion — scale', () => {
  const col = makeColumn({ id: 'q3', name: 'Điểm', type: QTYPE.LINEAR_SCALE, scale: { min: 1, max: 5 } });
  const data = responses([{ q3: '5' }, { q3: '3' }, { q3: '1' }, { q3: '7' }, { q3: '' }]);
  it('computes stats and rejects out-of-range values', () => {
    const a = analyzeQuestion(col, data);
    expect(a.kind).toBe('scale');
    expect(a.valid).toBe(3);
    expect(a.invalid).toBe(1);
    expect(a.blank).toBe(1);
    expect(a.mean).toBe(3);
    expect(a.median).toBe(3);
    expect(a.min).toBe(1);
    expect(a.max).toBe(5);
  });
});

describe('analyzeQuestion — text', () => {
  const col = makeColumn({ id: 'q4', name: 'Góp ý', type: QTYPE.PARAGRAPH });
  const data = responses([{ q4: 'dịch vụ tốt' }, { q4: 'dịch vụ tốt' }, { q4: 'giá cao' }, { q4: '' }]);
  it('collects unique values, duplicates and keywords', () => {
    const a = analyzeQuestion(col, data);
    expect(a.kind).toBe('text');
    expect(a.valid).toBe(3);
    expect(a.unique).toBe(2);
    expect(a.duplicates[0].count).toBe(2);
    expect(a.entries.length).toBe(3);
    expect(a.keywords.length).toBeGreaterThan(0);
  });
});

describe('analyzeGrid', () => {
  const cols = [
    makeColumn({ id: 'g1', header: 'Q [A]', name: 'Q [A]', type: QTYPE.GRID_SINGLE, gridBase: 'Q' }),
    makeColumn({ id: 'g2', header: 'Q [B]', name: 'Q [B]', type: QTYPE.GRID_SINGLE, gridBase: 'Q' }),
  ];
  const data = responses([{ g1: 'Có', g2: 'Không' }, { g1: 'Có', g2: 'Có' }]);
  it('produces per-row categories and aggregated choices', () => {
    const a = analyzeGrid(cols, data);
    expect(a.kind).toBe('grid');
    expect(a.rows.length).toBe(2);
    expect(a.rows[0].inner).toBe('A');
    expect(a.choices.length).toBeGreaterThan(0);
  });
});

describe('buildQuestionGroups', () => {
  it('groups bracket headers and keeps standalone columns separate', () => {
    const dataset = makeDataset({
      columns: [
        makeColumn({ id: 'a', header: 'Q [A]', type: QTYPE.GRID_SINGLE, gridBase: 'Q' }),
        makeColumn({ id: 'b', header: 'Q [B]', type: QTYPE.GRID_SINGLE, gridBase: 'Q' }),
        makeColumn({ id: 'c', header: 'Độc lập', type: QTYPE.SHORT_TEXT }),
      ],
    });
    const groups = buildQuestionGroups(dataset);
    const grid = groups.find((g) => g.gridBase === 'Q');
    expect(grid).toBeTruthy();
    expect(grid.columns.length).toBe(2);
    expect(groups.find((g) => g.id === 'c')).toBeTruthy();
  });

  it('ignores excluded columns', () => {
    const dataset = makeDataset({
      columns: [makeColumn({ id: 'a', header: 'A', included: false }), makeColumn({ id: 'b', header: 'B' })],
    });
    const groups = buildQuestionGroups(dataset);
    expect(groups.length).toBe(1);
  });
});

describe('analyzeGroup dispatch', () => {
  it('routes grid groups to analyzeGrid', () => {
    const dataset = makeDataset({
      columns: [
        makeColumn({ id: 'a', header: 'Q [A]', type: QTYPE.GRID_SINGLE, gridBase: 'Q' }),
        makeColumn({ id: 'b', header: 'Q [B]', type: QTYPE.GRID_SINGLE, gridBase: 'Q' }),
      ],
    });
    const group = buildQuestionGroups(dataset)[0];
    const a = analyzeGroup(group, responses([{ a: 'Có', b: 'Không' }]));
    expect(a.kind).toBe('grid');
  });
});

describe('overallCompletion', () => {
  it('computes average answered percent and fully-completed count', () => {
    const dataset = makeDataset({
      columns:
        [makeColumn({ id: 'c1', header: 'C1' }), makeColumn({ id: 'c2', header: 'C2' })],
    });
    const data = responses([{ c1: 'x', c2: 'y' }, { c1: 'x', c2: '' }]);
    const c = overallCompletion(dataset, data);
    expect(c.responses).toBe(2);
    expect(c.questions).toBe(2);
    expect(c.fullyCompleted).toBe(1);
    expect(c.fullyCompletedPercent).toBe(50);
    expect(c.avgAnsweredPercent).toBe(75);
  });
});

describe('analyzeQuestion — date uses cached values (P1.1)', () => {
  const col = makeColumn({ id: 'qd', name: 'Ngày', type: QTYPE.DATE });
  it('prefers the cached date and treats cached null as invalid', () => {
    const r1 = makeResponse({ qd: '2024-01-10' });
    r1.dates = { qd: new Date(2023, 0, 1).getTime() };
    const r2 = makeResponse({ qd: '2024-01-10' });
    r2.dates = { qd: null };
    const a = analyzeQuestion(col, [r1, r2]);
    expect(a.valid).toBe(1);
    expect(a.invalid).toBe(1);
    expect(a.byDay[0].key).toBe('2023-01-01');
  });
});
