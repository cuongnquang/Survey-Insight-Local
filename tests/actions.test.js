import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

let actions, state;

function makeDs(id, name) {
  return { id, name, columns: [], responses: [], source: { type: 'file', fileName: 'a.csv' }, updatedAt: Date.now() };
}

beforeEach(async () => {
  vi.resetModules();
  state = await import('../src/core/state.js');
  actions = await import('../src/core/actions.js');
  state.resetState();
});

describe('actions (M18)', () => {
  it('addDataset stores, activates and persists the selection', async () => {
    const ds = makeDs('a1', 'Bộ A');
    await actions.addDataset(ds);
    const s = state.getState();
    expect(s.dataset.id).toBe('a1');
    expect(s.settings.activeDatasetId).toBe('a1');
    expect(s.datasets.some((d) => d.id === 'a1')).toBe(true);
    expect(await (await import('../src/core/store.js')).store.getSetting('activeDatasetId')).toBe('a1');
  });

  it('setActiveDataset switches the active dataset', async () => {
    await actions.addDataset(makeDs('a1', 'A'));
    await actions.addDataset(makeDs('a2', 'B'));
    const active = await actions.setActiveDataset('a1');
    expect(active.id).toBe('a1');
    expect(state.getState().dataset.id).toBe('a1');
    expect(state.getState().settings.activeDatasetId).toBe('a1');
  });

  it('removeDataset promotes the next dataset when the active one is deleted', async () => {
    await actions.addDataset(makeDs('a1', 'A'));
    await actions.addDataset(makeDs('a2', 'B'));
    const activeId = state.getState().dataset.id; // a2
    await actions.removeDataset(activeId);
    expect(state.getState().datasets.find((d) => d.id === activeId)).toBeUndefined();
    expect(state.getState().dataset.id).toBe('a1');
    expect(state.getState().settings.activeDatasetId).toBe('a1');
  });

  it('updateSettings merges a patch', async () => {
    const next = await actions.updateSettings({ dateDayFirst: false, syncIntervalMinutes: 30 });
    expect(next.dateDayFirst).toBe(false);
    expect(next.syncIntervalMinutes).toBe(30);
    expect(state.getState().settings.dateDayFirst).toBe(false);
  });

  it('getFilteredResponses returns all rows when no filter is set', async () => {
    const ds = makeDs('f1', 'F');
    await actions.addDataset(ds);
    expect(actions.getFilteredResponses()).toEqual([]);
  });
});
