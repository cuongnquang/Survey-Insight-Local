import { describe, it, expect, vi } from 'vitest';
import { apiGet, parseSpreadsheetId } from '../src/integrations/googleSheets.js';

function res(status, { json, headers } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (headers ? headers[k] : undefined) },
    json: async () => {
      if (json instanceof Error) throw json;
      return json ?? {};
    },
  };
}

describe('parseSpreadsheetId', () => {
  it('extracts ids from urls and raw ids', () => {
    expect(parseSpreadsheetId('https://docs.google.com/spreadsheets/d/ABCdef1234567890xyz/edit')).toBe(
      'ABCdef1234567890xyz'
    );
    expect(parseSpreadsheetId('a'.repeat(25))).toBe('a'.repeat(25));
    expect(parseSpreadsheetId('short')).toBeNull();
  });
});

describe('apiGet retry/backoff (M15)', () => {
  it('returns parsed json when the request succeeds', async () => {
    const fetchImpl = vi.fn(async () => res(200, { json: { values: [['a']] } }));
    const out = await apiGet('id/values/x', 'tok', { fetchImpl, sleep: async () => {} });
    expect(out).toEqual({ values: [['a']] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(500))
      .mockResolvedValueOnce(res(200, { json: { ok: true } }));
    const sleep = vi.fn(async () => {});
    const out = await apiGet('id', 'tok', { fetchImpl, sleep });
    expect(out).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After on 429', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(429, { headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(res(200, { json: { ok: true } }));
    const sleep = vi.fn(async () => {});
    await apiGet('id', 'tok', { fetchImpl, sleep, retries: 1 });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after exhausting retries', async () => {
    const fetchImpl = vi.fn(async () => res(500));
    const sleep = vi.fn(async () => {});
    await expect(apiGet('id', 'tok', { fetchImpl, sleep, retries: 2 })).rejects.toMatchObject({ status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 401 and flags it as an auth error', async () => {
    const fetchImpl = vi.fn(async () => res(401));
    const sleep = vi.fn(async () => {});
    await expect(apiGet('id', 'tok', { fetchImpl, sleep })).rejects.toMatchObject({
      status: 401,
      authError: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a network error then throws a friendly error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const sleep = vi.fn(async () => {});
    await expect(apiGet('id', 'tok', { fetchImpl, sleep, retries: 1 })).rejects.toThrow(/Không kết nối được/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
