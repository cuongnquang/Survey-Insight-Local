import { describe, it, expect } from 'vitest';
import { normalizeText, tokenize, keywordFrequency, findDuplicates, clusterByTokens, searchTexts } from '../src/analysis/text.js';

describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText('Hello, World!')).toBe('hello world');
  });
  it('collapses whitespace', () => {
    expect(normalizeText('a    b   c')).toBe('a b c');
  });
});

describe('tokenize', () => {
  it('removes stopwords and short tokens', () => {
    const tokens = tokenize('Đây là một câu hỏi về dịch vụ');
    expect(tokens).not.toContain('là');
    expect(tokens).toContain('dịch');
  });
  it('keeps stopwords when disabled', () => {
    const tokens = tokenize('the service is good', { removeStopwords: false });
    expect(tokens).toContain('the');
  });
});

describe('keywordFrequency', () => {
  it('counts keywords across texts', () => {
    const freq = keywordFrequency(['dịch vụ tốt', 'dịch vụ nhanh', 'dịch vụ tốt']);
    const dich = freq.find((f) => f.word === 'dịch');
    expect(dich.count).toBe(3);
  });
  it('respects the limit', () => {
    const freq = keywordFrequency(['alpha beta gamma delta'], { limit: 2 });
    expect(freq.length).toBeLessThanOrEqual(2);
  });
});

describe('findDuplicates', () => {
  it('finds repeated content ignoring case/punctuation', () => {
    const dups = findDuplicates(['Tốt', 'tốt', 'Tệ', 'tốt!']);
    const top = dups[0];
    expect(top.count).toBe(3);
  });
  it('returns empty when nothing repeats', () => {
    expect(findDuplicates(['a', 'b', 'c'])).toEqual([]);
  });
});

describe('clusterByTokens', () => {
  it('groups similar answers', () => {
    const entries = [
      { value: 'giao hàng nhanh chóng', index: 0 },
      { value: 'giao hàng rất nhanh', index: 1 },
      { value: 'giá cả hợp lý', index: 2 },
    ];
    const groups = clusterByTokens(entries, { threshold: 0.3 });
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].items.length).toBeGreaterThanOrEqual(2);
  });

  it('compares against a representative set instead of the growing union (M9)', () => {
    const entries = [
      { value: 'aa bb', index: 0 },
      { value: 'bb cc', index: 1 },
      { value: 'cc dd', index: 2 },
    ];
    const groups = clusterByTokens(entries, { threshold: 0.25 });
    expect(groups.length).toBe(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].items.map((i) => i.index)).toEqual([0, 1]);
  });

  it('caps stored items per cluster but keeps the true count (M9)', () => {
    const entries = [
      { value: 'aa bb', index: 0 },
      { value: 'aa bb', index: 1 },
      { value: 'aa bb', index: 2 },
    ];
    const groups = clusterByTokens(entries, { threshold: 0.5, maxItems: 1 });
    expect(groups[0].count).toBe(3);
    expect(groups[0].items.length).toBe(1);
  });
});

describe('searchTexts', () => {
  it('filters entries containing the query', () => {
    const entries = [{ value: 'dịch vụ tốt' }, { value: 'giá cao' }];
    expect(searchTexts(entries, 'tốt').length).toBe(1);
    expect(searchTexts(entries, '').length).toBe(2);
  });
});
