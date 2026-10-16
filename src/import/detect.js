import { QTYPE, SEPARATORS } from '../core/constants.js';
import { isEmptyValue } from '../core/model.js';
import { parseNumber, splitValues, toKey } from '../core/values.js';
import { parseDate, parseTime } from '../core/dates.js';

const YES = new Set(['yes', 'y', 'true', 'có', 'co', 'đồng ý', 'dong y', 'x', '1']);
const NO = new Set(['no', 'n', 'false', 'không', 'khong', 'không đồng ý', 'khong dong y', '0']);
const SCALE_HINTS = ['1-5', '1 - 5', '1-10', '1 - 10', 'thang', 'scale', 'tuyến tính', 'linear', 'từ 1 đến', '1 to 5', '1 to 10'];
const RATING_HINTS = ['sao', 'star', 'đánh giá', 'danh gia', 'rate', 'rating'];
const PARAGRAPH_HINTS = ['đoạn', 'doan', 'mô tả', 'mo ta', 'ý kiến', 'y kien', 'nhận xét', 'nhan xet', 'chi tiết', 'comment'];
const DROPDOWN_HINTS = ['thả xuống', 'tha xuong', 'dropdown', 'danh sách', 'chọn từ'];

function headerHas(header, list) {
  const h = String(header || '').toLowerCase();
  return list.some((k) => h.includes(k));
}

export function uniqueValues(samples) {
  const map = new Map();
  for (const v of samples) {
    if (isEmptyValue(v)) continue;
    const k = toKey(v);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function separatorUsage(nonEmpty) {
  const candidates = [
    { key: 'comma', sep: ',' },
    { key: 'semicolon', sep: ';' },
    { key: 'pipe', sep: '|' },
    { key: 'newline', sep: '\n' },
  ];
  const results = [];
  for (const c of candidates) {
    let usedRows = 0;
    let totalParts = 0;
    const partFreq = new Map();
    for (const v of nonEmpty) {
      const parts = String(v)
        .split(c.sep)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        usedRows += 1;
        totalParts += parts.length;
        for (const p of parts) partFreq.set(toKey(p), (partFreq.get(toKey(p)) || 0) + 1);
      }
    }
    const usage = usedRows / nonEmpty.length;
    const avgParts = usedRows ? totalParts / usedRows : 0;
    const distinctParts = partFreq.size;
    const repeated = [...partFreq.values()].filter((n) => n >= 2).length;
    results.push({ key: c.key, usage, avgParts, distinctParts, repeated, usedRows });
  }
  return results;
}

export function detectSeparator(nonEmpty) {
  const stats = separatorUsage(nonEmpty).sort((a, b) => b.usage - a.usage);
  for (const s of stats) {
    const plausible =
      s.usage >= 0.5 &&
      s.avgParts >= 2 &&
      s.avgParts <= 10 &&
      s.distinctParts <= 30 &&
      (s.repeated >= 2 || s.distinctParts <= 6);
    if (plausible) return s;
  }
  return null;
}

export function computeOptions(samples, separator = 'comma', customSeparator = '') {
  const col = { separator, customSeparator };
  const map = new Map();
  for (const v of samples) {
    if (isEmptyValue(v)) continue;
    for (const part of splitValues(v, col)) {
      const k = toKey(part);
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

function isIntegerLike(n) {
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;
}

export function detectColumnType(header, samples, { dayFirst = true } = {}) {
  const nonEmpty = samples.filter((v) => !isEmptyValue(v));
  const result = {
    type: QTYPE.UNKNOWN,
    separator: 'comma',
    customSeparator: '',
    scale: null,
    options: [],
    confidence: 'low',
    reasons: [],
  };
  if (nonEmpty.length === 0) {
    result.reasons.push('Cột không có giá trị mẫu.');
    return result;
  }
  const n = nonEmpty.length;
  const distinct = uniqueValues(nonEmpty);
  const h = String(header || '').toLowerCase();

  const dateHits = nonEmpty.filter((v) => parseDate(v, { dayFirst })).length;
  const timeHits = nonEmpty.filter((v) => parseTime(v) && !parseDate(v, { dayFirst })).length;
  const numericVals = nonEmpty.map((v) => parseNumber(v)).filter((x) => x != null);

  const looksNumericHeavy = numericVals.length / n >= 0.9;

  if (!looksNumericHeavy && dateHits / n >= 0.8) {
    result.type = QTYPE.DATE;
    result.confidence = dateHits / n >= 0.95 ? 'high' : 'medium';
    result.reasons.push('Phần lớn giá trị đọc được thành ngày.');
    return result;
  }
  if (!looksNumericHeavy && timeHits / n >= 0.8) {
    result.type = QTYPE.TIME;
    result.confidence = timeHits / n >= 0.95 ? 'high' : 'medium';
    result.reasons.push('Phần lớn giá trị đọc được thành giờ.');
    return result;
  }

  const sep = detectSeparator(nonEmpty);
  if (sep) {
    result.type = QTYPE.MULTIPLE_CHOICE;
    result.separator = sep.key;
    result.confidence = sep.usage >= 0.8 ? 'high' : 'medium';
    result.options = computeOptions(nonEmpty, sep.key);
    result.reasons.push(
      `Có dấu phân tách "${SEPARATORS[sep.key] === '\n' ? 'xuống dòng' : SEPARATORS[sep.key]}" ở ${Math.round(
        sep.usage * 100
      )}% số câu trả lời, các lựa chọn lặp lại nhiều lần.`
    );
    return result;
  }

  const keys = [...distinct.keys()];
  const lowerKeys = keys.map((k) => k.toLowerCase());
  const allYesNo =
    keys.length <= 2 &&
    lowerKeys.every((k) => YES.has(k) || NO.has(k)) &&
    lowerKeys.some((k) => YES.has(k)) &&
    lowerKeys.some((k) => NO.has(k));
  if (allYesNo) {
    result.type = QTYPE.YES_NO;
    result.confidence = 'high';
    result.options = keys.map((k) => ({ value: k, count: distinct.get(k) }));
    result.reasons.push('Chỉ có hai giá trị dạng Có/Không.');
    return result;
  }

  const ints = numericVals.filter(isIntegerLike);
  if (looksNumericHeavy && ints.length / numericVals.length >= 0.95) {
    const min = Math.min(...ints);
    const max = Math.max(...ints);
    const span = max - min;
    const scaleHint = headerHas(h, SCALE_HINTS);
    const ratingHint = headerHas(h, RATING_HINTS);
    const smallContiguous = min >= 0 && max <= 5 && distinct.size <= 6;
    if ((scaleHint || ratingHint || smallContiguous) && span <= 10 && min >= 0) {
      result.type = ratingHint && !scaleHint ? QTYPE.RATING : QTYPE.LINEAR_SCALE;
      result.scale = { min, max };
      result.confidence = scaleHint || ratingHint ? 'high' : 'medium';
      result.reasons.push(`Giá trị số nguyên trong khoảng ${min}–${max}.`);
      return result;
    }
  }

  const distinctRatio = distinct.size / n;
  if (distinct.size <= 24 && (distinctRatio < 0.6 || n <= 12)) {
    const dropdownHint = headerHas(h, DROPDOWN_HINTS);
    result.type = dropdownHint ? QTYPE.DROPDOWN : QTYPE.SINGLE_CHOICE;
    result.options = [...distinct.entries()].map(([value, count]) => ({ value, count }));
    result.confidence = distinctRatio < 0.3 ? 'high' : 'medium';
    result.reasons.push(
      `Chỉ có ${distinct.size} giá trị khác nhau trên ${n} câu trả lời — có thể là câu hỏi lựa chọn.`
    );
    return result;
  }

  const avgLen = nonEmpty.reduce((s, v) => s + String(v).length, 0) / n;
  if (avgLen > 120 || headerHas(h, PARAGRAPH_HINTS)) {
    result.type = QTYPE.PARAGRAPH;
    result.confidence = headerHas(h, PARAGRAPH_HINTS) ? 'high' : 'medium';
    result.reasons.push('Độ dài câu trả lời trung bình lớn.');
    return result;
  }

  if (distinctRatio >= 0.6) {
    result.type = QTYPE.SHORT_TEXT;
    result.confidence = 'medium';
    result.reasons.push('Nhiều giá trị khác nhau, câu trả lời ngắn.');
    return result;
  }

  result.reasons.push('Không đủ tín hiệu để xác định loại câu hỏi.');
  return result;
}

const GRID_SUFFIX_RE = /^(.*?)\s*\[(.+)\]\s*$/;

export function detectGridGroups(headers) {
  const groups = new Map();
  for (const h of headers) {
    const m = String(h || '').match(GRID_SUFFIX_RE);
    if (!m) continue;
    const base = m[1].trim();
    const row = m[2].trim();
    if (!base || !row) continue;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ header: h, row });
  }
  const out = new Map();
  for (const [base, items] of groups) {
    if (items.length >= 2) out.set(base, items);
  }
  return out;
}
