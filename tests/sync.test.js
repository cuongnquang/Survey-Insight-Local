import { describe, it, expect } from 'vitest';
import { computeSyncDiff, applySyncDiff } from '../src/integrations/sync.js';

const sig = (columnIds) => (r) => columnIds.map((id) => String(r.values[id])).join('|');

describe('computeSyncDiff (no stable id, multiset match)', () => {
  it('treats duplicate content as separate responses', () => {
    const existing = [
      { id: 'r1', values: { a: 'x' } },
      { id: 'r2', values: { a: 'x' } },
    ];
    const incoming = [
      { values: { a: 'x' } },
      { values: { a: 'x' } },
      { values: { a: 'x' } },
    ];
    const diff = computeSyncDiff(existing, incoming, { columnIds: ['a'], signatureOf: sig(['a']) });
    expect(diff.unchangedCount).toBe(2);
    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(0);
  });

  it('detects removed rows that no longer exist', () => {
    const existing = [
      { id: 'r1', values: { a: 'x' } },
      { id: 'r2', values: { a: 'y' } },
    ];
    const incoming = [{ values: { a: 'x' } }];
    const diff = computeSyncDiff(existing, incoming, { columnIds: ['a'], signatureOf: sig(['a']) });
    expect(diff.removedCount).toBe(1);
    expect(diff.toRemove).toContain('r2');
  });
});

describe('computeSyncDiff (stable id)', () => {
  const idOf = (r) => r.externalId ?? r.id ?? null;
  it('updates rows whose content changed, matched by id', () => {
    const existing = [{ id: 'a', values: { v: '1' } }];
    const incoming = [{ externalId: 'a', values: { v: '2' } }];
    const diff = computeSyncDiff(existing, incoming, { columnIds: ['v'], idOf, signatureOf: sig(['v']) });
    expect(diff.updatedCount).toBe(1);
    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);
  });

  it('marks unchanged rows when content matches by id', () => {
    const existing = [{ id: 'a', values: { v: '1' } }];
    const incoming = [{ externalId: 'a', values: { v: '1' } }];
    const diff = computeSyncDiff(existing, incoming, { columnIds: ['v'], idOf, signatureOf: sig(['v']) });
    expect(diff.unchangedCount).toBe(1);
    expect(diff.hasChanges).toBe(false);
  });

  it('removes ids that disappeared', () => {
    const existing = [{ id: 'a', values: { v: '1' } }, { id: 'b', values: { v: '2' } }];
    const incoming = [{ externalId: 'a', values: { v: '1' } }];
    const diff = computeSyncDiff(existing, incoming, { columnIds: ['v'], idOf, signatureOf: sig(['v']) });
    expect(diff.toRemove).toEqual(['b']);
  });
});

describe('applySyncDiff', () => {
  it('applies add, update and remove', () => {
    const existing = [
      { id: 'a', values: { v: '1' } },
      { id: 'b', values: { v: '2' } },
    ];
    const diff = {
      toAdd: [{ values: { v: '9' } }],
      toUpdate: [{ id: 'a', response: { values: { v: '100' } } }],
      toRemove: ['b'],
    };
    const next = applySyncDiff(existing, diff, {
      makeResponse: (r) => ({ id: 'new', values: r.values }),
      cloneResponse: (prev, incoming) => ({ ...prev, values: incoming.values }),
    });
    expect(next.find((r) => r.id === 'a').values.v).toBe('100');
    expect(next.some((r) => r.id === 'b')).toBe(false);
    expect(next.some((r) => r.id === 'new')).toBe(true);
    expect(next.length).toBe(2);
  });
});
