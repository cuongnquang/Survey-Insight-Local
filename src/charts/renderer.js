import Chart from 'chart.js/auto';
import { CHART } from '../core/constants.js';

export const PALETTE = [
  '#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#0EA5E9', '#14B8A6', '#F97316', '#EC4899',
];

export function paletteAt(i) {
  return PALETTE[i % PALETTE.length];
}

const LONG_LABEL = 14;

function maxLabelLength(items, key = 'value') {
  return items.reduce((m, it) => Math.max(m, String(it[key] ?? '').length), 0);
}

export function chooseChart(analysis, opts = {}) {
  if (!analysis) return CHART.NONE;
  if (analysis.kind === 'categorical') {
    const n = analysis.categories.length;
    if (n === 0) return CHART.NONE;
    if (analysis.multi) {
      return maxLabelLength(analysis.categories) > LONG_LABEL ? CHART.BAR_HORIZONTAL : CHART.BAR;
    }
    if (n <= 6) return CHART.DOUGHNUT;
    return maxLabelLength(analysis.categories) > LONG_LABEL ? CHART.BAR_HORIZONTAL : CHART.BAR;
  }
  if (analysis.kind === 'scale') return analysis.distribution.length ? CHART.BAR : CHART.NONE;
  if (analysis.kind === 'date') return analysis.byDay.length ? CHART.LINE : CHART.NONE;
  if (analysis.kind === 'time') return CHART.BAR;
  if (analysis.kind === 'text') {
    if (opts.textMode === 'keywords') return analysis.keywords.length ? CHART.BAR_HORIZONTAL : CHART.NONE;
    if (opts.textMode === 'duplicates') return analysis.duplicates.length ? CHART.BAR_HORIZONTAL : CHART.NONE;
    return analysis.keywords.length ? CHART.BAR_HORIZONTAL : CHART.NONE;
  }
  if (analysis.kind === 'grid') return analysis.choices.length ? CHART.BAR : CHART.TABLE;
  return CHART.NONE;
}

export function availableChartTypes(analysis) {
  if (!analysis) return [];
  switch (analysis.kind) {
    case 'categorical':
      return [CHART.DOUGHNUT, CHART.PIE, CHART.BAR, CHART.BAR_HORIZONTAL];
    case 'scale':
      return [CHART.BAR, CHART.BAR_HORIZONTAL, CHART.LINE];
    case 'date':
      return [CHART.LINE, CHART.BAR];
    case 'time':
      return [CHART.BAR, CHART.BAR_HORIZONTAL];
    case 'text':
      return [CHART.BAR_HORIZONTAL, CHART.BAR];
    case 'grid':
      return [CHART.BAR];
    default:
      return [];
  }
}

function baseOptions(extra = {}) {
  const legend =
    extra.legend !== undefined
      ? extra.legend
      : { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 14, color: '#475569', font: { family: 'Inter', size: 12 } } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    indexAxis: extra.indexAxis,
    plugins: {
      legend,
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        cornerRadius: 8,
        titleFont: { family: 'Inter', size: 12, weight: '600' },
        bodyFont: { family: 'IBM Plex Mono', size: 12 },
        padding: 10,
        ...(extra.tooltip || {}),
      },
    },
    scales: extra.scales,
  };
}

export function buildChartSpec(analysis, chartType) {
  const type = chartType || chooseChart(analysis);
  if (!analysis) return null;

  if (analysis.kind === 'categorical' || analysis.kind === 'grid') {
    return buildCategoricalSpec(analysis, type);
  }
  if (analysis.kind === 'scale') {
    return buildScaleSpec(analysis, type);
  }
  if (analysis.kind === 'date') {
    return buildDateSpec(analysis, type);
  }
  if (analysis.kind === 'time') {
    return {
      type: 'bar',
      data: {
        labels: analysis.byHour.map((h) => `${String(h.hour).padStart(2, '0')}h`),
        datasets: [{ label: 'Số phản hồi', data: analysis.byHour.map((h) => h.count), backgroundColor: paletteAt(0) }],
      },
      options: baseOptions({
        legend: { display: false },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Số phản hồi' } } },
      }),
      canvasTitle: 'Số phản hồi theo giờ',
    };
  }
  if (analysis.kind === 'text') {
    const items = analysis.keywords.slice(0, 15);
    const horizontal = type !== CHART.BAR;
    return {
      type: 'bar',
      data: {
        labels: items.map((k) => k.word),
        datasets: [{ label: 'Tần suất', data: items.map((k) => k.count), backgroundColor: paletteAt(2) }],
      },
      options: baseOptions({
        legend: { display: false },
        ...(horizontal ? { indexAxis: 'y' } : {}),
        scales: horizontal
          ? { x: { beginAtZero: true, title: { display: true, text: 'Số lần xuất hiện' } } }
          : { y: { beginAtZero: true, title: { display: true, text: 'Số lần xuất hiện' } } },
      }),
      canvasTitle: 'Từ khóa phổ biến',
    };
  }
  return null;
}

function buildCategoricalSpec(analysis, type) {
  if (analysis.kind === 'grid') {
    const choices = analysis.choices.map((c) => c.value);
    const datasets = choices.map((choice, ci) => ({
      label: choice,
      data: analysis.rows.map((row) => row.categories.find((c) => c.value === choice)?.count || 0),
      backgroundColor: paletteAt(ci),
    }));
    return {
      type: 'bar',
      data: { labels: analysis.rows.map((r) => r.inner), datasets },
      options: baseOptions({
        indexAxis: 'y',
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
      }),
      canvasTitle: 'Phân bố theo hàng của câu hỏi lưới',
    };
  }

  const cats = analysis.categories;
  const labels = cats.map((c) => c.value);
  const counts = cats.map((c) => c.count);
  const pcts = cats.map((c) => c.pct);
  const colors = cats.map((_, i) => paletteAt(i));

  const isCircle = type === CHART.PIE || type === CHART.DOUGHNUT;
  if (isCircle) {
    return {
      type: type === CHART.PIE ? 'pie' : 'doughnut',
      data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2 }] },
      options: baseOptions({
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${counts[ctx.dataIndex]} (${pcts[ctx.dataIndex]}%)`,
          },
        },
        scales: undefined,
      }),
      canvasTitle: 'Phân bố đáp án',
    };
  }

  const horizontal = type === CHART.BAR_HORIZONTAL;
  const dataset = {
    label: 'Số lượt chọn',
    data: counts,
    backgroundColor: analysis.multi ? paletteAt(1) : paletteAt(0),
  };
  const options = baseOptions({
    legend: { display: false },
    indexAxis: horizontal ? 'y' : 'x',
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${counts[ctx.dataIndex]} lượt (${pcts[ctx.dataIndex]}%)`,
      },
    },
    scales: horizontal
      ? { x: { beginAtZero: true, title: { display: true, text: 'Số lượt chọn' } } }
      : { y: { beginAtZero: true, title: { display: true, text: 'Số lượt chọn' } } },
  });

  return {
    type: 'bar',
    data: { labels, datasets: [dataset] },
    options,
    canvasTitle: 'Phân bố đáp án',
  };
}

function buildScaleSpec(analysis, type) {
  const labels = analysis.distribution.map((d) => d.value);
  const counts = analysis.distribution.map((d) => d.count);
  const horizontal = type === CHART.BAR_HORIZONTAL;
  const isLine = type === CHART.LINE;
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${counts[ctx.dataIndex]} lượt` } },
    },
    scales: horizontal
      ? { x: { beginAtZero: true, title: { display: true, text: 'Số lượt' } } }
      : { y: { beginAtZero: true, title: { display: true, text: 'Số lượt' } } },
  };
  return {
    type: isLine ? 'line' : 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Số lượt',
          data: counts,
          backgroundColor: isLine ? 'rgba(79,70,229,0.15)' : paletteAt(0),
          borderColor: paletteAt(0),
          borderWidth: isLine ? 2 : 0,
          fill: isLine,
          tension: 0.25,
        },
      ],
    },
    options,
    canvasTitle: 'Phân bố điểm',
  };
}

function buildDateSpec(analysis, type) {
  const isBar = type === CHART.BAR;
  const labels = analysis.byDay.map((d) => d.key);
  const counts = analysis.byDay.map((d) => d.count);
  return {
    type: isBar ? 'bar' : 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Số phản hồi',
          data: counts,
          borderColor: paletteAt(0),
          backgroundColor: isBar ? paletteAt(0) : 'rgba(79,70,229,0.15)',
          fill: !isBar,
          tension: 0.25,
          pointRadius: 2,
        },
      ],
    },
    options: baseOptions({
      legend: { display: false },
      scales: {
        x: { title: { display: true, text: 'Ngày' } },
        y: { beginAtZero: true, title: { display: true, text: 'Số phản hồi' } },
      },
    }),
    canvasTitle: 'Số phản hồi theo thời gian',
  };
}

const instances = new WeakMap();

function trackedChart(canvas) {
  return instances.get(canvas) || Chart.getChart(canvas) || null;
}

export function renderChart(canvas, spec) {
  destroyChart(canvas);
  if (!spec) return null;
  const chart = new Chart(canvas, {
    type: spec.type,
    data: spec.data,
    options: { ...spec.options, devicePixelRatio: window.devicePixelRatio || 1 },
  });
  instances.set(canvas, chart);
  return chart;
}

export function destroyChart(canvas) {
  if (!canvas) return;
  const chart = trackedChart(canvas);
  if (chart) {
    chart.destroy();
    instances.delete(canvas);
  }
}

export function destroyChartsIn(root) {
  if (!root) return;
  for (const canvas of root.querySelectorAll('canvas')) destroyChart(canvas);
}

export function chartPngFromCanvas(canvas) {
  const chart = trackedChart(canvas);
  return chart ? chart.toBase64Image('image/png', 1) : null;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function renderSpecToImage(spec, { width = 720, height = 400, scale = 2 } = {}) {
  if (!spec) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const options = {
    ...spec.options,
    responsive: false,
    animation: false,
    devicePixelRatio: scale,
    plugins: {
      ...(spec.options?.plugins || {}),
      legend: { ...(spec.options?.plugins?.legend || {}), display: true },
    },
  };
  const chart = new Chart(canvas, { type: spec.type, data: spec.data, options });
  try {
    await nextFrame();
    return chart.toBase64Image('image/png', 1);
  } finally {
    chart.destroy();
  }
}
