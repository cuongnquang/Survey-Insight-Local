// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const constructed = [];

vi.mock('chart.js/auto', () => {
  class Chart {
    constructor(canvas, cfg) {
      this.canvas = canvas;
      this.cfg = cfg;
      this.destroyed = false;
      constructed.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
    toBase64Image() {
      return 'data:image/png;base64,xx';
    }
  }
  Chart.getChart = () => null;
  Chart.register = () => {};
  return { default: Chart };
});

const { renderChart, destroyChart, destroyChartsIn, chartPngFromCanvas, buildChartSpec } = await import('../src/charts/renderer.js');

function spec() {
  return {
    type: 'bar',
    data: { labels: ['a'], datasets: [{ data: [1] }] },
    options: {},
  };
}

function dom() {
  document.body.innerHTML = '<div id="view"><canvas id="c1"></canvas></div><div id="detached"><canvas id="c2"></canvas></div>';
  return { view: document.getElementById('view'), detached: document.getElementById('detached') };
}

describe('chart lifecycle (P0.4)', () => {
  it('renderChart tracks the instance and destroys it before re-render', () => {
    dom();
    const c1 = document.getElementById('c1');
    const first = renderChart(c1, spec());
    const second = renderChart(c1, spec());
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
    expect(first).not.toBe(second);
    destroyChart(c1);
    expect(second.destroyed).toBe(true);
  });

  it('renderChart(canvas, null) still destroys the previous chart (null-spec path)', () => {
    dom();
    const c1 = document.getElementById('c1');
    const chart = renderChart(c1, spec());
    const out = renderChart(c1, null);
    expect(out).toBeNull();
    expect(chart.destroyed).toBe(true);
  });

  it('destroyChart is safe on unknown/detached canvases', () => {
    dom();
    const c2 = document.getElementById('c2');
    expect(() => destroyChart(c2)).not.toThrow();
    expect(() => destroyChart(null)).not.toThrow();
    const orphan = document.createElement('canvas');
    expect(() => destroyChart(orphan)).not.toThrow();
  });

  it('destroyChartsIn destroys every tracked canvas under the remounted root', () => {
    dom();
    const view = document.getElementById('view');
    const c1 = document.getElementById('c1');
    const chart = renderChart(c1, spec());
    destroyChartsIn(view);
    expect(chart.destroyed).toBe(true);
    expect(destroyChartsIn(null)).toBeUndefined();
    expect(destroyChartsIn(document.createElement('div'))).toBeUndefined();
  });

  it('chartPngFromCanvas reports from the tracked instance', () => {
    dom();
    const c1 = document.getElementById('c1');
    expect(chartPngFromCanvas(c1)).toBeNull();
    renderChart(c1, spec());
    expect(chartPngFromCanvas(c1)).toMatch(/^data:image\/png/);
  });

  it('renderSpecToImage cleans up its temporary chart even though it is untracked', async () => {
    const { renderSpecToImage } = await import('../src/charts/renderer.js');
    dom();
    const c1 = document.getElementById('c1');
    const before = constructed.length;
    const url = await renderSpecToImage(c1, spec());
    expect(url).toMatch(/^data:image\/png/);
    expect(constructed.length).toBe(before + 1);
    expect(constructed[constructed.length - 1].destroyed).toBe(true);
    expect(chartPngFromCanvas(c1)).toBeNull();
  });

  it('buildChartSpec text honours the chosen orientation (BAR vs BAR_HORIZONTAL)', () => {
    const analysis = {
      kind: 'text',
      keywords: [{ word: 'abc', count: 3 }],
      duplicates: [],
    };
    const horizontal = buildChartSpec(analysis, 'barH');
    const vertical = buildChartSpec(analysis, 'bar');
    expect(horizontal.options.indexAxis).toBe('y');
    expect(horizontal.options.scales.x).toBeTruthy();
    expect(vertical.options.indexAxis).toBeUndefined();
    expect(vertical.options.scales.y).toBeTruthy();
    expect(vertical.options.scales.x).toBeUndefined();
  });
});
