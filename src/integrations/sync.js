function defaultSignature(response, columnIds) {
  if (!columnIds) return JSON.stringify(response.values);
  return columnIds.map((id) => normVal(response.values[id])).join('\u0001');
}

function normVal(v) {
  if (v == null) return '\u0000';
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\r\n/g, '\n').trim();
}

/**
 * Compute the difference between the responses already stored and the responses
 * read from a source. Duplicate content is always preserved: two rows with the
 * same content are two separate responses.
 *
 * - When a stable id is available (idOf returns a value) rows are matched by id,
 *   and content changes become updates. If either side contains duplicate ids,
 *   id matching would silently collapse rows, so the diff falls back to
 *   content matching and reports `fallbackReason: 'duplicate_ids'`.
 * - When no stable id exists, rows are matched by content signature using a
 *   multiset, so identical rows are matched one-to-one.
 *
 * Safety signals in the result:
 * - `matchedCount`: rows matched between the two sides.
 * - `idDomainUnsafe`: stable ids exist on both sides but not a single row
 *   matched — usually a changed id column; the caller must confirm before
 *   applying (the diff would otherwise remove everything and re-add).
 * - `unidentifiedCount`: incoming rows without a stable id.
 */
export function computeSyncDiff(existing = [], incoming = [], options = {}) {
  const { columnIds = null, idOf, signatureOf } = options;
  const sig = (r) => (signatureOf ? signatureOf(r) : defaultSignature(r, columnIds));
  const idFn = idOf || ((r) => r.id ?? null);

  const anyStableId = incoming.some((r) => idFn(r));

  if (!anyStableId) return contentDiff(existing, incoming, sig);

  const existingCounts = new Map();
  for (const r of existing) {
    const id = idFn(r);
    if (id) existingCounts.set(id, (existingCounts.get(id) || 0) + 1);
  }
  const incomingCounts = new Map();
  for (const r of incoming) {
    const id = idFn(r);
    if (id) incomingCounts.set(id, (incomingCounts.get(id) || 0) + 1);
  }
  const dupExisting = [...existingCounts.values()].some((n) => n > 1);
  const dupIncoming = [...incomingCounts.values()].some((n) => n > 1);
  if (dupExisting || dupIncoming) {
    const res = contentDiff(existing, incoming, sig);
    res.fallbackReason = 'duplicate_ids';
    res.warnings = [
      'Mã phản hồi trùng lặp trong dữ liệu — so khớp theo nội dung để không gộp nhầm các phản hồi trùng mã.',
    ];
    return res;
  }

  const existingById = new Map();
  const idlessExisting = [];
  for (const r of existing) {
    const id = idFn(r);
    if (id) existingById.set(id, r);
    else idlessExisting.push(r);
  }

  const seen = new Set();
  const matchedRowIds = new Set();
  const toAdd = [];
  const toUpdate = [];
  let unchanged = 0;
  let matched = 0;
  const incomingIdless = [];
  for (const r of incoming) {
    const id = idFn(r);
    if (!id) {
      incomingIdless.push(r);
      continue;
    }
    if (existingById.has(id)) {
      seen.add(id);
      matched += 1;
      const prev = existingById.get(id);
      if (sig(prev) === sig(r)) unchanged += 1;
      else toUpdate.push({ id: prev.id, response: r });
    } else {
      toAdd.push(r);
    }
  }

  if (incomingIdless.length || idlessExisting.length) {
    const buckets = new Map();
    for (const r of idlessExisting) {
      const s = sig(r);
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(r);
    }
    for (const r of incomingIdless) {
      const bucket = buckets.get(sig(r));
      if (bucket && bucket.length) {
        matchedRowIds.add(bucket.shift().id);
        unchanged += 1;
        matched += 1;
      } else {
        toAdd.push(r);
      }
    }
  }

  const toRemove = [];
  for (const r of existing) {
    const id = idFn(r);
    if (id) {
      if (!seen.has(id)) toRemove.push(r.id);
    } else if (!matchedRowIds.has(r.id)) {
      toRemove.push(r.id);
    }
  }
  const unidentifiedCount = incomingIdless.length;
  const idDomainUnsafe = existing.length > 0 && incoming.length > 0 && matched === 0;
  return summarize({ toAdd, toUpdate, toRemove, unchanged, matched, unidentifiedCount, idDomainUnsafe });
}

function contentDiff(existing, incoming, sig) {
  const buckets = new Map();
  for (const r of existing) {
    const s = sig(r);
    if (!buckets.has(s)) buckets.set(s, []);
    buckets.get(s).push(r);
  }
  const matchedIds = new Set();
  const toAdd = [];
  let unchanged = 0;
  for (const r of incoming) {
    const s = sig(r);
    const bucket = buckets.get(s);
    if (bucket && bucket.length) {
      const match = bucket.shift();
      matchedIds.add(match.id);
      unchanged += 1;
    } else {
      toAdd.push(r);
    }
  }
  const toRemove = existing.filter((r) => !matchedIds.has(r.id)).map((r) => r.id);
  return summarize({ toAdd, toUpdate: [], toRemove, unchanged, matched: unchanged });
}

function summarize({
  toAdd,
  toUpdate,
  toRemove,
  unchanged,
  matched = unchanged,
  unidentifiedCount = 0,
  idDomainUnsafe = false,
}) {
  return {
    toAdd,
    toUpdate,
    toRemove,
    unchanged,
    matchedCount: matched,
    unidentifiedCount,
    idDomainUnsafe,
    warnings: [],
    fallbackReason: null,
    addedCount: toAdd.length,
    updatedCount: toUpdate.length,
    removedCount: toRemove.length,
    unchangedCount: unchanged,
    hasChanges: toAdd.length > 0 || toUpdate.length > 0 || toRemove.length > 0,
  };
}

export function applySyncDiff(existing, diff, { makeResponse, cloneResponse } = {}) {
  const removeSet = new Set(diff.toRemove);
  const updateMap = new Map(diff.toUpdate.map((u) => [u.id, u.response]));
  const next = [];
  for (const r of existing) {
    if (removeSet.has(r.id)) continue;
    if (updateMap.has(r.id)) {
      const incoming = updateMap.get(r.id);
      const merged = cloneResponse ? cloneResponse(r, incoming) : { ...r, values: incoming.values };
      next.push(merged);
    } else {
      next.push(r);
    }
  }
  for (const r of diff.toAdd) {
    next.push(makeResponse ? makeResponse(r) : r);
  }
  return next;
}
