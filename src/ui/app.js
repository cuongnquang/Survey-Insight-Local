import { h, mount, clear, svgIcon, ICONS } from './dom.js';
import { subscribe, getState, setState } from '../core/state.js';
import { getFilteredResponses } from '../core/actions.js';
import { activeFilterCount } from '../core/filters.js';
import { formatInt } from '../utils/format.js';
import { destroyChartsIn } from '../charts/renderer.js';
import { mountFiltersBar, updateFiltersBar } from './filtersBar.js';
import { renderOverview } from './pages/overview.js';
import { renderQuestions } from './pages/questions.js';
import { renderResponses } from './pages/responses.js';
import { renderSources } from './pages/sources.js';
import { renderSettings } from './pages/settings.js';

const NAV = [
  { id: 'overview', label: 'Tổng quan', icon: ICONS.overview },
  { id: 'questions', label: 'Phân tích câu hỏi', icon: ICONS.questions },
  { id: 'responses', label: 'Dữ liệu phản hồi', icon: ICONS.responses },
  { id: 'sources', label: 'Nguồn dữ liệu', icon: ICONS.sources },
  { id: 'settings', label: 'Cài đặt', icon: ICONS.settings },
];

const PAGES = {
  overview: renderOverview,
  questions: renderQuestions,
  responses: renderResponses,
  sources: renderSources,
  settings: renderSettings,
};

const FILTER_PAGES = new Set(['overview', 'questions', 'responses']);

let els = {};
let mountedFilterDatasetId = null;
let prev = null;
let renderTimer = null;

export function initApp() {
  els = {
    app: document.getElementById('app'),
    boot: document.getElementById('boot'),
    nav: document.getElementById('nav'),
    topbar: document.getElementById('topbar'),
    railFoot: document.getElementById('railFoot'),
    filterSlot: document.getElementById('filterSlot'),
    view: document.getElementById('view'),
  };

  document.getElementById('app')?.removeAttribute('hidden');
  els.boot?.remove();

  subscribe(onState);
  onState(getState(), true);
}

function navigate(page) {
  if (getState().page === page) return;
  setState({ page });
  els.view?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function onState(state, immediate = false) {
  renderNav(state);
  renderTopbar(state);
  syncFiltersSlot(state);

  const filterOnly =
    prev &&
    prev.dataset === state.dataset &&
    prev.page === state.page &&
    prev.datasets === state.datasets &&
    prev.reportSelection === state.reportSelection &&
    prev.settings === state.settings &&
    prev.google === state.google;

  if (filterOnly && !immediate) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderPage(getState()), 220);
  } else {
    clearTimeout(renderTimer);
    renderPage(state);
  }
  prev = state;
}

function renderNav(state) {
  mount(
    els.nav,
    ...NAV.map((item) =>
      h(
        'button.navitem',
        {
          type: 'button',
          'aria-current': state.page === item.id ? 'page' : null,
          onClick: () => navigate(item.id),
        },
        svgIcon(item.icon, 18),
        h('span', {}, item.label)
      )
    )
  );

  mount(
    els.railFoot,
    h('p.small.muted', {}, 'Dữ liệu ở lại trên máy của bạn.'),
    h('p.small.muted', {}, 'local-first · v1.0')
  );
}

function renderTopbar(state) {
  const { dataset } = state;
  const filterCount = activeFilterCount(state.filters);
  mount(
    els.topbar,
    h(
      'div.topbar__id',
      {},
      h('div.topbar__survey', {}, dataset ? dataset.name : 'Survey Insight Local'),
      h(
        'div.topbar__meta',
        {},
        dataset
          ? [
              h('span', {}, `${formatInt(dataset.responses.length)} phản hồi`),
              h('span', {}, dataset.source?.type === 'sheets' ? 'Google Sheets' : 'Tệp cục bộ'),
            ]
          : h('span', {}, 'Chưa có bộ dữ liệu')
      )
    ),
    h(
      'div.topbar__actions',
      {},
      filterCount ? h('span.tag.tag--ok', {}, `${filterCount} bộ lọc`) : null,
      h(
        'button.btn.btn--sm.btn--primary',
        { type: 'button', onClick: () => navigate('sources') },
        svgIcon(ICONS.sources, 14),
        'Nguồn dữ liệu'
      )
    )
  );
}

function syncFiltersSlot(state) {
  const show = state.dataset && FILTER_PAGES.has(state.page);
  if (!show) {
    if (els.filterSlot.childElementCount) clear(els.filterSlot);
    mountedFilterDatasetId = null;
    return;
  }
  if (mountedFilterDatasetId !== state.dataset.id) {
    mountFiltersBar(els.filterSlot, state);
    mountedFilterDatasetId = state.dataset.id;
  } else {
    updateFiltersBar(els.filterSlot, state);
  }
}

function renderPage(state) {
  const y = window.scrollY;
  const page = state.page;
  const dataset = state.dataset;
  const needsDataset = FILTER_PAGES.has(page);

  destroyChartsIn(els.view);

  if (needsDataset && !dataset) {
    mountEmpty(els.view);
    return;
  }

  const ctx = {
    state,
    dataset,
    responses: dataset ? getFilteredResponses() : [],
    rerender: () => renderPage(getState()),
    navigate,
  };

  try {
    PAGES[page](els.view, ctx);
  } catch (err) {
    console.error('render page failed', err);
    mount(els.view, h('div.callout.callout--err', {}, `Không hiển thị được trang: ${err.message || err}`));
  }
  if (y) window.scrollTo({ top: y });
}

function mountEmpty(view) {
  mount(
    view,
    h(
      'div.empty',
      {},
      h('span.empty__icon', {}, svgIcon(ICONS.sources, 24)),
      h('h2', {}, 'Chưa có dữ liệu khảo sát'),
      h('p', {}, 'Nhập dữ liệu từ tệp Excel/CSV hoặc Google Sheets để bắt đầu phân tích. Dữ liệu được xử lý hoàn toàn trên máy của bạn.'),
      h(
        'button.btn.btn--primary',
        { type: 'button', onClick: () => navigate('sources') },
        svgIcon(ICONS.sources, 16),
        'Nhập dữ liệu'
      )
    )
  );
}
