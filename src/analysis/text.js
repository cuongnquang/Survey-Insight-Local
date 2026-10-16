export const STOPWORDS_VI = new Set([
  'và', 'là', 'của', 'có', 'không', 'được', 'cho', 'với', 'các', 'một', 'này', 'để', 'trong',
  'khi', 'như', 'thì', 'ở', 'ra', 'vào', 'đã', 'sẽ', 'đang', 'bị', 'bởi', 'về', 'từ', 'đến',
  'theo', 'trên', 'dưới', 'những', 'cũng', 'nhưng', 'hoặc', 'nếu', 'vì', 'nên', 'mà', 'rằng',
  'tôi', 'mình', 'bạn', 'họ', 'nó', 'chúng', 'ta', 'anh', 'chị', 'em', 'ạ', 'à', 'ừ', 'vâng',
  'dạ', 'thế', 'vậy', 'rất', 'quá', 'lắm', 'hơn', 'kém', 'được', 'bằng', 'tại', 'do', 'qua',
  'cái', 'con', 'chiếc', 'người', 'việc', 'điều', 'cần', 'phải', 'muốn', 'biết', 'thấy',
]);

export const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'he', 'she', 'them', 'my', 'your',
  'our', 'their', 'me', 'us', 'do', 'does', 'did', 'have', 'has', 'had', 'not', 'no', 'yes',
  'from', 'will', 'would', 'can', 'could', 'should', 'there', 'here', 'what', 'which', 'who',
  'when', 'where', 'why', 'how', 'all', 'any', 'some', 'more', 'most', 'very', 'just', 'too',
]);

export function normalizeText(input, { removePunctuation = true, lower = true } = {}) {
  let s = String(input ?? '');
  if (lower) s = s.toLowerCase();
  if (removePunctuation) {
    s = s.replace(/[.,!?;:„“”"'`()[\]{}<>/\\|@#$%^&*_=+~–—…·•«»]/g, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function tokenize(input, { removeStopwords = true, minLength = 2, lower = true } = {}) {
  const norm = normalizeText(input, { removePunctuation: true, lower });
  if (!norm) return [];
  const raw = norm.split(' ').filter(Boolean);
  return raw.filter((t) => {
    if (t.length < minLength) return false;
    if (removeStopwords && (STOPWORDS_VI.has(t) || STOPWORDS_EN.has(t))) return false;
    return true;
  });
}

export function keywordFrequency(texts, opts = {}) {
  const { removeStopwords = true, minLength = 2, limit = 40 } = opts;
  const freq = new Map();
  for (const text of texts) {
    for (const token of tokenize(text, { removeStopwords, minLength })) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function findDuplicates(texts) {
  const map = new Map();
  for (const raw of texts) {
    if (raw == null) continue;
    const display = String(raw);
    if (!display.trim()) continue;
    const key = normalizeText(display);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { label: display, count: 0, originals: new Set() });
    const entry = map.get(key);
    entry.count += 1;
    entry.originals.add(display);
  }
  return [...map.values()]
    .filter((e) => e.count >= 2)
    .map((e) => ({ value: e.label, count: e.count, variants: [...e.originals] }))
    .sort((a, b) => b.count - a.count);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function clusterByTokens(
  entries,
  { threshold = 0.6, minSize = 2, maxGroups = 40, maxItems = 200 } = {}
) {
  const prepared = entries
    .map((e) => {
      const value = typeof e === 'string' ? e : e.value;
      const tokens = tokenize(value);
      return {
        value,
        index: typeof e === 'string' ? undefined : e.index,
        norm: normalizeText(value),
        set: new Set(tokens),
      };
    })
    .filter((e) => e.norm);

  const clusters = [];
  for (const item of prepared) {
    let best = null;
    let bestScore = 0;
    for (const c of clusters) {
      // So sánh với "đại diện" (tập token của câu mở đầu cụm) thay vì hợp của
      // mọi câu đã gộp: hợp sẽ phình dần và khiến cụm hút quá nhiều câu.
      const score = jaccard(item.set, c.set);
      if (score >= threshold && score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best) {
      best.count += 1;
      if (best.items.length < maxItems) best.items.push(item);
    } else {
      clusters.push({ set: new Set(item.set), items: [item], count: 1 });
    }
  }

  return clusters
    .filter((c) => c.count >= minSize)
    .map((c) => {
      const counts = new Map();
      for (const it of c.items) counts.set(it.norm, (counts.get(it.norm) || 0) + 1);
      let label = c.items[0].value;
      let labelCount = 0;
      for (const [norm, n] of counts) {
        if (n > labelCount) {
          labelCount = n;
          const found = c.items.find((i) => i.norm === norm);
          if (found) label = found.value;
        }
      }
      return {
        label,
        count: c.count,
        items: c.items.map((i) => ({ value: i.value, index: i.index })),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, maxGroups);
}

export function searchTexts(entries, query) {
  if (!query || !query.trim()) return entries;
  const norm = normalizeText(query);
  return entries.filter((e) => normalizeText(e.value).includes(norm));
}
