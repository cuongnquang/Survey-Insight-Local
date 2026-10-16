import { describe, it, expect } from 'vitest';
import { detectColumnType, detectSeparator, computeOptions, detectGridGroups, uniqueValues } from '../src/import/detect.js';
import { QTYPE } from '../src/core/constants.js';

describe('detectColumnType', () => {
  it('detects dates', () => {
    const r = detectColumnType('Ngày gửi', ['2024-01-01', '2024-02-03', '2024-03-10', '2024-04-01']);
    expect(r.type).toBe(QTYPE.DATE);
  });

  it('detects yes/no', () => {
    const r = detectColumnType('Đồng ý?', ['có', 'không', 'có', 'có']);
    expect(r.type).toBe(QTYPE.YES_NO);
  });

  it('detects yes/no regardless of casing', () => {
    const r = detectColumnType('Đồng ý?', ['Có', 'Không', 'Có']);
    expect(r.type).toBe(QTYPE.YES_NO);
  });

  it('detects multiple choice via repeated separators', () => {
    const r = detectColumnType('Chọn nhiều', ['a, b', 'a, c', 'a, b', 'b, c']);
    expect(r.type).toBe(QTYPE.MULTIPLE_CHOICE);
    expect(r.separator).toBe('comma');
    expect(r.options.length).toBeGreaterThan(0);
  });

  it('detects a small linear scale', () => {
    const r = detectColumnType('Mức độ', ['1', '2', '3', '4', '5', '3', '2']);
    expect([QTYPE.LINEAR_SCALE, QTYPE.RATING]).toContain(r.type);
    expect(r.scale).toEqual({ min: 1, max: 5 });
  });

  it('detects single choice for few distinct values', () => {
    const r = detectColumnType('Chọn một', ['đỏ', 'xanh', 'đỏ', 'vàng', 'xanh', 'đỏ']);
    expect(r.type).toBe(QTYPE.SINGLE_CHOICE);
  });

  it('detects short text for many distinct short values', () => {
    const samples = Array.from({ length: 30 }, (_, i) => `câu trả lời số ${i} khác nhau`);
    const r = detectColumnType('Ý kiến', samples);
    expect([QTYPE.SHORT_TEXT, QTYPE.PARAGRAPH]).toContain(r.type);
  });

  it('returns UNKNOWN for empty samples', () => {
    const r = detectColumnType('Cột trống', []);
    expect(r.type).toBe(QTYPE.UNKNOWN);
  });
});

describe('detectSeparator', () => {
  it('finds the dominant separator', () => {
    const s = detectSeparator(['a;b', 'a;c', 'b;c', 'a;b']);
    expect(s.key).toBe('semicolon');
  });
  it('returns null when no separator is plausible', () => {
    expect(detectSeparator(['apple', 'banana', 'cherry'])).toBeNull();
  });
});

describe('computeOptions', () => {
  it('counts split options', () => {
    const opts = computeOptions(['a, b', 'a', 'a, b'], 'comma');
    const a = opts.find((o) => o.value === 'a');
    expect(a.count).toBe(3);
  });
});

describe('detectGridGroups', () => {
  it('groups bracket-suffixed headers with 2+ members', () => {
    const groups = detectGridGroups(['Q [A]', 'Q [B]', 'Other', 'R [X]']);
    expect(groups.has('Q')).toBe(true);
    expect(groups.get('Q').length).toBe(2);
    expect(groups.has('R')).toBe(false);
  });

  it('ignores bracket headers with empty labels (M7)', () => {
    const groups = detectGridGroups(['Q [A]', 'Q [ ]', 'Q [B]']);
    expect(groups.has('Q')).toBe(true);
    expect(groups.get('Q').length).toBe(2);
    expect(groups.get('Q').every((it) => it.row !== '')).toBe(true);
  });
});

describe('uniqueValues', () => {
  it('counts occurrences ignoring blanks', () => {
    const m = uniqueValues(['a', 'a', '', null, 'b']);
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(1);
    expect(m.size).toBe(2);
  });
});
