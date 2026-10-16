const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const ISO_OFFSET_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const DMY_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const YMD_RE = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/;
const COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function safeDate(y, m, d, hh = 0, mm = 0, ss = 0) {
  if (hh > 23 || mm > 59 || ss > 59) return null;
  const year = y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
  const dt = new Date(year, m, d, hh, mm, ss);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getMonth() !== m || dt.getDate() !== d) return null;
  return dt;
}

function applyMeridiem(hh, ap) {
  if (!ap) return hh;
  const isPm = ap.toLowerCase() === 'pm';
  if (isPm && hh < 12) return hh + 12;
  if (!isPm && hh === 12) return 0;
  return hh;
}

export function parseDate(value, { dayFirst = true } = {}) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  if (typeof value === 'number') {
    if (value > 20000 && value < 90000) return excelSerialToDate(value);
    if (Number.isInteger(value) && value >= 19000101 && value <= 29991231) {
      return safeDate(Math.floor(value / 10000), Math.floor(value / 100) % 100 - 1, value % 100);
    }
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;

  if (ISO_OFFSET_RE.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let m = s.match(ISO_RE);
  if (m) return safeDate(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));

  m = s.match(DMY_RE);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const year = +m[3];
    let day;
    let mon;
    if (a > 12) {
      day = a;
      mon = b - 1;
    } else if (b > 12) {
      day = b;
      mon = a - 1;
    } else if (dayFirst) {
      day = a;
      mon = b - 1;
    } else {
      mon = a - 1;
      day = b;
    }
    return safeDate(year, mon, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  m = s.match(YMD_RE);
  if (m) return safeDate(+m[1], +m[2] - 1, +m[3]);

  m = s.match(COMPACT_RE);
  if (m) return safeDate(+m[1], +m[2] - 1, +m[3]);

  const cleaned = s.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 3) {
    const monKey = parts[0].slice(0, 3).toLowerCase();
    if (MONTHS[monKey] !== undefined) {
      return safeDate(+parts[2], MONTHS[monKey], +parts[1]);
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) return d;
  return null;
}

/**
 * Excel stores a naive local date/time as a serial number. Convert the serial
 * to the same wall-clock date in the local timezone (not a shifted UTC instant).
 */
export function excelSerialToDate(serial) {
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const u = new Date(utcMs);
  return new Date(
    u.getUTCFullYear(),
    u.getUTCMonth(),
    u.getUTCDate(),
    u.getUTCHours(),
    u.getUTCMinutes(),
    u.getUTCSeconds(),
    u.getUTCMilliseconds()
  );
}

/**
 * Resolve a response's date for a column, preferring the value parsed and
 * cached at import/sync time (`response.dates[columnId]`, an epoch in ms).
 * Falls back to parsing the raw value for legacy responses.
 */
export function responseDateAt(response, columnId, dayFirst = true) {
  const dates = response?.dates;
  if (dates && Object.prototype.hasOwnProperty.call(dates, columnId)) {
    const ts = dates[columnId];
    return ts == null ? null : new Date(ts);
  }
  const raw = response?.values?.[columnId];
  if (raw == null || raw === '') return null;
  return parseDate(raw, { dayFirst });
}

export function parseTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return { h: value.getHours(), m: value.getMinutes(), s: value.getSeconds() };
  }
  const m = String(value).trim().match(TIME_RE);
  if (!m) {
    const d = parseDate(value);
    if (d) return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
    return null;
  }
  let hh = +m[1];
  hh = applyMeridiem(hh, m[4]);
  if (hh > 23 || +m[2] > 59) return null;
  return { h: hh, m: +m[2], s: +(m[3] || 0) };
}

export function toDateKey(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toTimeKey(t) {
  if (!t) return null;
  const hh = String(t.h).padStart(2, '0');
  const mm = String(t.m).padStart(2, '0');
  return `${hh}:${mm}`;
}
