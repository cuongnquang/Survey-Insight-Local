import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => {
  vi.resetModules();
});

async function freshStore() {
  const mod = await import('../src/core/store.js');
  return mod.store;
}

describe('store (M18)', () => {
  it('roundtrips datasets', async () => {
    const store = await freshStore();
    await store.saveDataset({ id: 'ds-round', name: 'A', responses: [], columns: [] });
    expect((await store.getDataset('ds-round')).name).toBe('A');
    expect((await store.getAllDatasets()).some((d) => d.id === 'ds-round')).toBe(true);
    await store.deleteDataset('ds-round');
    expect(await store.getDataset('ds-round')).toBeUndefined();
  });

  it('roundtrips settings', async () => {
    const store = await freshStore();
    await store.saveSetting('k-round', 'v');
    expect(await store.getSetting('k-round')).toBe('v');
    expect((await store.getSettings())['k-round']).toBe('v');
    await store.saveSetting('k-round', null);
  });

  it('M2: does not cache a failed open — it retries on the next call', async () => {
    const idb = globalThis.indexedDB;
    const realOpen = idb.open;
    let calls = 0;
    idb.open = function (...args) {
      calls += 1;
      if (calls === 1) {
        const req = {};
        setTimeout(() => {
          if (req.onerror) req.onerror({ target: req, error: new Error('open failed') });
        }, 0);
        return req;
      }
      return realOpen.apply(this, args);
    };
    try {
      const store = await freshStore();
      await expect(store.getSetting('nope')).rejects.toBeTruthy();
      await expect(store.getSetting('nope')).resolves.toBeUndefined();
      expect(calls).toBe(2);
    } finally {
      idb.open = realOpen;
    }
  });
});
