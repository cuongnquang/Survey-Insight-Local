import { describe, it, expect } from 'vitest';
import { parseDate, parseTime, toDateKey, excelSerialToDate, responseDateAt } from '../src/core/dates.js';

describe('parseDate', () => {
  it('parses ISO dates', () => {
    const d = parseDate('2024-03-15');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });
  it('respects day-first for ambiguous values', () => {
    const d = parseDate('05/03/2024', { dayFirst: true });
    expect(d.getDate()).toBe(5);
    expect(d.getMonth()).toBe(2);
  });
  it('respects month-first when dayFirst is false', () => {
    const d = parseDate('05/03/2024', { dayFirst: false });
    expect(d.getDate()).toBe(3);
    expect(d.getMonth()).toBe(4);
  });
  it('disambiguates when one side is > 12', () => {
    const d = parseDate('25/03/2024', { dayFirst: false });
    expect(d.getDate()).toBe(25);
    expect(d.getMonth()).toBe(2);
  });
  it('parses month names', () => {
    const d = parseDate('March 3, 2024');
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(3);
  });
  it('returns null for empty or invalid', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
  it('converts excel serial numbers in range', () => {
    const d = parseDate(45000);
    expect(d instanceof Date).toBe(true);
  });
});

describe('excelSerialToDate', () => {
  it('converts a known serial to the right date', () => {
    const d = excelSerialToDate(45351);
    expect(d.getUTCFullYear()).toBe(2024);
  });
});

describe('parseTime', () => {
  it('parses 24h time', () => {
    expect(parseTime('14:30')).toEqual({ h: 14, m: 30, s: 0 });
  });
  it('parses meridiem time', () => {
    expect(parseTime('2:05 pm')).toEqual({ h: 14, m: 5, s: 0 });
  });
  it('returns null for invalid time', () => {
    expect(parseTime('abc')).toBeNull();
  });
});

describe('toDateKey', () => {
  it('formats local date key', () => {
    expect(toDateKey(new Date(2024, 0, 9))).toBe('2024-01-09');
  });
});

describe('parseDate timezone correctness (P1.1)', () => {
  it('parses an explicit UTC instant (Z suffix) as that instant', () => {
    const d = parseDate('2025-06-01T10:30:00Z');
    expect(d.getTime()).toBe(Date.UTC(2025, 5, 1, 10, 30, 0));
  });

  it('parses an explicit offset instant correctly', () => {
    const d = parseDate('2025-06-01T10:30:00+07:00');
    expect(d.getTime()).toBe(Date.UTC(2025, 5, 1, 3, 30, 0));
  });

  it('treats an ISO string without zone as local wall-clock', () => {
    const d = parseDate('2025-06-01T10:30:00');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(30);
  });

  it('rejects impossible time components instead of rolling over', () => {
    expect(parseDate('2025-06-01T99:99:99')).toBeNull();
    expect(parseDate('2024-13-45')).toBeNull();
    expect(parseDate('32/13/2024')).toBeNull();
  });
});

describe('excel serial (P1.1)', () => {
  it('maps the serial to a local wall-clock date, not a shifted instant', () => {
    const d = excelSerialToDate(45809);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it('keeps the time fraction', () => {
    expect(excelSerialToDate(45809.5).getHours()).toBe(12);
  });

  it('parses compact numeric yyyymmdd values', () => {
    expect(parseDate(20250601).getFullYear()).toBe(2025);
    expect(parseDate(20250601).getMonth()).toBe(5);
    expect(parseDate('20250601').getDate()).toBe(1);
  });
});

describe('responseDateAt (P1.1)', () => {
  it('prefers the date cached at import/sync time', () => {
    const response = { id: 'r', values: { d: '2024-01-10' }, dates: { d: new Date(2023, 0, 1).getTime() } };
    const d = responseDateAt(response, 'd');
    expect(d.getFullYear()).toBe(2023);
  });

  it('treats a cached null as an unparseable date', () => {
    const response = { id: 'r', values: { d: 'not a date' }, dates: { d: null } };
    expect(responseDateAt(response, 'd')).toBeNull();
  });

  it('falls back to parsing when there is no cache (legacy responses)', () => {
    const response = { id: 'r', values: { d: '2024-01-10' } };
    const d = responseDateAt(response, 'd');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
  });
});
