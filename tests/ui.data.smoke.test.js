// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { makeDataset, makeColumn, makeResponse } from '../src/core/model.js';
import { QTYPE } from '../src/core/constants.js';
import { setState, getState } from '../src/core/state.js';

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
    <div id="boot" class="boot"></div>
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

describe('UI with data', () => {
  it('navigates overview/questions/responses with dataset and filters', async () => {
    window.scrollTo = () => {};
    skeleton();
    const { initApp } = await import('../src/ui/app.js');

    const c1 = makeColumn({ header: 'Giới tính', type: QTYPE.SINGLE_CHOICE, options: ['Nam', 'Nữ', 'Khác'] });
    const c2 = makeColumn({ header: 'Sở thích', type: QTYPE.MULTIPLE_CHOICE, separator: 'comma', options: ['A', 'B', 'C'] });
    const c3 = makeColumn({ header: 'Góp ý', type: QTYPE.PARAGRAPH });
    const c4 = makeColumn({ header: 'Điểm', type: QTYPE.LINEAR_SCALE, scale: { min: 1, max: 5 } });
    const c5 = makeColumn({ header: 'Ngày', type: QTYPE.DATE });
    const ds = makeDataset({
      name: 'Test',
      columns: [c1, c2, c3, c4, c5],
      responses: [
        makeResponse({ [c1.id]: 'Nam', [c2.id]: 'A,B', [c3.id]: 'OK', [c4.id]: 4, [c5.id]: '2025-10-01' }),
        makeResponse({ [c1.id]: 'Nữ', [c2.id]: 'A', [c3.id]: 'OK', [c4.id]: 5, [c5.id]: '2025-10-02' }),
        makeResponse({ [c1.id]: 'Nữ', [c2.id]: 'C', [c3.id]: 'OTHER', [c4.id]: 3, [c5.id]: '2025-10-03' }),
      ],
    });

    initApp();
    setState({ dataset: ds, datasets: [ds], settings: { ...getState().settings, activeDatasetId: ds.id } });

    let view = document.getElementById('view');
    expect(view.querySelector('.callout--err')).toBeNull();
    expect(view.innerHTML).toMatch(/Tổng quan|khảo sát/i);

    const nav = document.getElementById('nav');
    const qbtn = [...nav.querySelectorAll('button.navitem')].find((b) => b.textContent.includes('Phân tích'));
    qbtn.click();
    view = document.getElementById('view');
    expect(view.querySelector('.callout--err')).toBeNull();
    const head = view.querySelector('.qcard__head');
    expect(head).toBeTruthy();
    expect(() => head.click()).not.toThrow();
    expect(view.querySelector('.callout--err')).toBeNull();

    const rbtn = [...nav.querySelectorAll('button.navitem')].find((b) => b.textContent.includes('Dữ liệu phản hồi'));
    rbtn.click();
    view = document.getElementById('view');
    expect(view.querySelector('.callout--err')).toBeNull();

    const obtn = [...nav.querySelectorAll('button.navitem')].find((b) => b.textContent.includes('Tổng quan'));
    obtn.click();
    view = document.getElementById('view');
    expect(view.querySelector('.callout--err')).toBeNull();

    const keyword = document.querySelector('#filterSlot input[type="search"]');
    expect(keyword).toBeTruthy();
    keyword.value = 'OK';
    keyword.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 320));
    expect(view.querySelector('.callout--err')).toBeNull();
    expect(view.textContent).toMatch(/bộ lọc đang áp dụng/i);
  });
});
