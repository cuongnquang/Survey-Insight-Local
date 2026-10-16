export function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

export function mean(nums) {
  if (!nums.length) return null;
  return sum(nums) / nums.length;
}

export function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function min(nums) {
  if (!nums.length) return null;
  let m = nums[0];
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] < m) m = nums[i];
  }
  return m;
}

export function max(nums) {
  if (!nums.length) return null;
  let m = nums[0];
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] > m) m = nums[i];
  }
  return m;
}

export function quantile(nums, q) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function stddev(nums) {
  const m = mean(nums);
  if (m == null) return null;
  const variance = mean(nums.map((n) => (n - m) ** 2));
  return variance == null ? null : Math.sqrt(variance);
}

export function pct(part, whole) {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function round(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return n;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
