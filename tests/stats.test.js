import { describe, it, expect } from 'vitest';
import { sum, mean, median, min, max, quantile, stddev, pct, round } from '../src/analysis/stats.js';

describe('stats', () => {
  it('sums and means', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBeNull();
  });
  it('computes median for odd and even sizes', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('computes min and max', () => {
    expect(min([4, 2, 9])).toBe(2);
    expect(max([4, 2, 9])).toBe(9);
    expect(min([])).toBeNull();
  });
  it('handles very large arrays without exceeding the call stack', () => {
    const big = Array.from({ length: 200000 }, (_, i) => i - 100000);
    expect(min(big)).toBe(-100000);
    expect(max(big)).toBe(99999);
  });
  it('computes quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
  it('computes stddev', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
  it('computes percentages safely', () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBe(0);
  });
  it('rounds to digits', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(null)).toBeNull();
  });
});
