import { describe, it, expect } from 'vitest';
import { matchesFilters, applyFilters, activeFilterCount, dateFilterIssue, dateFilterStats } from '../src/core/filters.js';
import { makeColumn, makeResponse } from '../src/core/model.js';
import { QTYPE } from '../src/core/constants.js';
import { emptyFilters } from '../src/core/state.js';

const choice = makeColumn({ id: 'c_choice', name: 'Màu', type: QTYPE.SINGLE_CHOICE, separator: 'comma' });
const multi = makeColumn({ id: 'c_multi', name: 'Sở thích', type: QTYPE.MULTIPLE_CHOICE, separator: 'comma' });
const num = makeColumn({ id: 'c_num', name: 'Điểm', type: QTYPE.LINEAR_SCALE });
const date = makeColumn({ id: 'c_date', name: 'Ngày', type: QTYPE.DATE });
const text = makeColumn({ id: 'c_text', name: 'Góp ý', type: QTYPE.PARAGRAPH });
const columns = [choice, multi, num, date, text];

const responses = [
  makeResponse({ c_choice: 'đỏ', c_multi: 'a, b', c_num: '5', c_date: '2024-01-10', c_text: 'dịch vụ tốt' }),
  makeResponse({ c_choice: 'xanh', c_multi: 'b', c_num: '2', c_date: '2024-02-20', c_text: 'giá cao' }),
  makeResponse({ c_choice: 'đỏ', c_multi: 'c', c_num: '4', c_date: '2024-03-05', c_text: 'tạm được' }),
];

describe('activeFilterCount', () => {
  it('counts each active filter facet', () => {
    const f = { ...emptyFilters(), keyword: 'abc', conditions: [{ id: 'x' }] };
    expect(activeFilterCount(f)).toBe(2);
  });
  it('is zero for empty filters', () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(activeFilterCount(null)).toBe(0);
  });
});

describe('matchesFilters', () => {
  it('matches keyword across all columns', () => {
    const f = { ...emptyFilters(), keyword: 'dịch vụ' };
    expect(matchesFilters(responses[0], columns, f)).toBe(true);
    expect(matchesFilters(responses[1], columns, f)).toBe(false);
  });

  it('matches a choice equality condition', () => {
    const f = { ...emptyFilters(), conditions: [{ id: '1', columnId: 'c_choice', op: 'eq', value: 'đỏ' }] };
    const out = applyFilters(responses, columns, f);
    expect(out.length).toBe(2);
  });

  it('matches membership inside a multi-choice cell', () => {
    const f = { ...emptyFilters(), conditions: [{ id: '1', columnId: 'c_multi', op: 'contains', value: 'a' }] };
    const out = applyFilters(responses, columns, f);
    expect(out.length).toBe(1);
  });

  it('matches numeric comparison', () => {
    const f = { ...emptyFilters(), conditions: [{ id: '1', columnId: 'c_num', op: 'gte', value: '4' }] };
    const out = applyFilters(responses, columns, f);
    expect(out.length).toBe(2);
  });

  it('matches date range', () => {
    const f = { ...emptyFilters(), dateColumnId: 'c_date', dateFrom: '2024-02-01', dateTo: '2024-02-29' };
    const out = applyFilters(responses, columns, f);
    expect(out.length).toBe(1);
    expect(out[0].values.c_date).toBe('2024-02-20');
  });

  it('matches group membership', () => {
    const f = { ...emptyFilters(), groupByColumnId: 'c_choice', groups: ['xanh'] };
    const out = applyFilters(responses, columns, f);
    expect(out.length).toBe(1);
  });

  it('returns all responses when no filters are active', () => {
    expect(applyFilters(responses, columns, emptyFilters()).length).toBe(3);
  });

  it('matches empty / not_empty operators', () => {
    const withBlank = [...responses, makeResponse({ c_num: '', c_choice: 'đỏ' })];
    const empty = applyFilters(withBlank, columns, { ...emptyFilters(), conditions: [{ id: '1', columnId: 'c_num', op: 'empty' }] });
    expect(empty.length).toBe(1);
    const notEmpty = applyFilters(withBlank, columns, { ...emptyFilters(), conditions: [{ id: '1', columnId: 'c_num', op: 'not_empty' }] });
    expect(notEmpty.length).toBe(3);
  });

  it('uses the date cached on the response (P1.1)', () => {
    const cached = makeResponse({ c_date: '2024-01-10' });
    cached.dates = { c_date: new Date(2023, 0, 1).getTime() };
    const f = { ...emptyFilters(), dateColumnId: 'c_date', dateFrom: '2024-01-01', dateTo: '2024-12-31' };
    expect(matchesFilters(cached, columns, f)).toBe(false);
  });
});

describe('date filter diagnostics (P1.2)', () => {
  it('reports an unparseable bound instead of silently widening', () => {
    const f = { ...emptyFilters(), dateColumnId: 'c_date', dateFrom: 'khong-phai-ngay' };
    const issue = dateFilterIssue(f, { dayFirst: true });
    expect(issue).toBeTruthy();
    expect(issue.issues[0]).toMatch(/Từ ngày/);
    expect(applyFilters(responses, columns, f).length).toBe(3);
  });

  it('reports a reversed range', () => {
    const f = { ...emptyFilters(), dateColumnId: 'c_date', dateFrom: '2024-12-01', dateTo: '2024-01-01' };
    const issue = dateFilterIssue(f, { dayFirst: true });
    expect(issue.issues.some((s) => /lớn hơn/.test(s))).toBe(true);
  });

  it('returns null when the range is valid or inactive', () => {
    expect(dateFilterIssue({ ...emptyFilters(), dateColumnId: 'c_date', dateFrom: '2024-01-01', dateTo: '2024-12-31' })).toBeNull();
    expect(dateFilterIssue(emptyFilters())).toBeNull();
  });

  it('counts responses with no valid date excluded by the range', () => {
    const withBlank = [...responses, makeResponse({ c_date: 'không rõ' })];
    const f = { ...emptyFilters(), dateColumnId: 'c_date', dateFrom: '2024-01-01', dateTo: '2024-12-31' };
    const stats = dateFilterStats(withBlank, date, f, { dayFirst: true });
    expect(stats).toEqual({ undated: 1, total: 4 });
    expect(dateFilterStats(withBlank, date, emptyFilters(), {})).toBeNull();
  });
});
