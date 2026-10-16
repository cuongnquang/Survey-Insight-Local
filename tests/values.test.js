import { describe, it, expect } from 'vitest';
import { separatorFor, splitValues, parseNumber, toKey } from '../src/core/values.js';

describe('separatorFor', () => {
  it('returns the mapped separator', () => {
    expect(separatorFor({ separator: 'semicolon' })).toBe(';');
    expect(separatorFor({ separator: 'pipe' })).toBe('|');
  });
  it('uses the custom separator when selected', () => {
    expect(separatorFor({ separator: 'custom', customSeparator: '###' })).toBe('###');
  });
  it('defaults to comma', () => {
    expect(separatorFor(null)).toBe(',');
  });
});

describe('splitValues', () => {
  it('splits and trims multiple values', () => {
    expect(splitValues('a, b ,c', { separator: 'comma' })).toEqual(['a', 'b', 'c']);
  });
  it('collapses whitespace inside parts', () => {
    expect(splitValues('red   apple; pear', { separator: 'semicolon' })).toEqual(['red apple', 'pear']);
  });
  it('returns empty array for blank input', () => {
    expect(splitValues('', { separator: 'comma' })).toEqual([]);
    expect(splitValues(null, { separator: 'comma' })).toEqual([]);
  });
  it('passes through arrays', () => {
    expect(splitValues(['x ', ' y'], { separator: 'comma' })).toEqual(['x', 'y']);
  });
  it('keeps a single value when there is no separator', () => {
    expect(splitValues('solo', { separator: 'comma' })).toEqual(['solo']);
  });
});

describe('parseNumber', () => {
  it('parses integers and decimals with dot or comma', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber('3.5')).toBe(3.5);
  });
  it('parses numbers with rating suffixes', () => {
    expect(parseNumber('4 sao')).toBe(4);
    expect(parseNumber('5 stars')).toBe(5);
  });
  it('returns null for non-numeric values', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
  it('handles negative numbers', () => {
    expect(parseNumber('-2')).toBe(-2);
  });
});

describe('toKey', () => {
  it('trims and collapses whitespace', () => {
    expect(toKey('  hello   world ')).toBe('hello world');
  });
});
