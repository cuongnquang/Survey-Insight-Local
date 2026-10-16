// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/charts/renderer.js', () => ({
  PALETTE: ['#12525F'],
  paletteAt: () => '#12525F',
  chooseChart: () => 'table',
  availableChartTypes: () => [],
  buildChartSpec: () => null,
  hasChartData: () => false,
  renderChart: () => null,
  destroyChart: () => {},
  destroyChartsIn: () => {},
  chartToPng: () => null,
  chartPngFromCanvas: () => null,
  renderSpecToImage: async () => null,
}));

function skeleton() {
  document.body.innerHTML = `
    <div id="boot" class="boot"><p class="boot__hint">Đang khởi động…</p></div>
    <div id="app" class="app" hidden>
      <aside class="rail">
        <nav class="rail__nav" id="nav"></nav>
        <div class="rail__foot" id="railFoot"></div>
      </aside>
      <div class="workarea">
        <header class="topbar" id="topbar"></header>
        <div id="filterSlot" class="filter-slot"></div>
        <main id="view" class="view" tabindex="-1"></main>
      </div>
    </div>
    <div id="toasts" class="toasts"></div>
    <div id="modalRoot" class="modal-root" hidden></div>
  `;
}

describe('UI smoke', () => {
  beforeAll(() => {
    window.scrollTo = () => {};
  });

  it('boots without a dataset and navigates every page', async () => {
    skeleton();
    const { initApp } = await import('../src/ui/app.js');
    expect(() => initApp()).not.toThrow();

    const nav = document.getElementById('nav');
    const view = document.getElementById('view');
    const buttons = [...nav.querySelectorAll('button.navitem')];
    expect(buttons.length).toBe(5);
    expect(document.getElementById('boot')).toBeNull();
    expect(view.querySelector('.empty')).toBeTruthy();

    for (const label of ['Nguồn dữ liệu', 'Cài đặt', 'Tổng quan']) {
      const btn = buttons.find((b) => b.textContent.includes(label));
      expect(() => btn.click()).not.toThrow();
      expect(view.querySelector('.callout--err')).toBeNull();
    }
  });
});
