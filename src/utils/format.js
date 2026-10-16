const nf = new Intl.NumberFormat('vi-VN');
const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function formatInt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return nf.format(Math.round(n));
}

export function formatNum(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return (digits >= 2 ? nf2 : nf1).format(n);
}

export function formatPercent(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${formatNum(n, digits)}%`;
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function relativeTime(ts) {
  if (!ts) return 'chưa có';
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatDate(ts);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${nf1.format(v)} ${units[i]}`;
}

export function truncate(s, n = 60) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

export function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm;
}
