import { h, mount, svgIcon, ICONS } from '../dom.js';
import { buildQuestionGroups, analyzeGroup } from '../../analysis/analyze.js';
import { createQuestionCard, drawCardChart } from '../questionCard.js';
import { toggleReportSelection, setReportSelection } from '../../core/actions.js';
import { openExportDialog } from '../exportDialog.js';
import { formatInt } from '../../utils/format.js';
import { getState } from '../../core/state.js';

const openSet = new Set();
const chartTypeMap = new Map();
let initialized = false;

export function renderQuestions(root, ctx) {
  const { dataset, responses } = ctx;
  const groups = buildQuestionGroups(dataset);
  if (!initialized) {
    groups.forEach((g, i) => {
      if (i < 3) openSet.add(g.id);
    });
    initialized = true;
  }
  // expand default first few open
  const state = getState();
  const selection = state.reportSelection;
  const analyses = groups.map((g) => analyzeGroup(g, responses, { dayFirst: dataset.dateMeta?.dayFirst !== false }));

  const allSelected = groups.length > 0 && groups.every((g) => selection.has(g.id));

  const toolbar = h(
    'div.hstack',
    {},
    h('button.btn.btn--sm', { type: 'button', onClick: () => { groups.forEach((g) => openSet.add(g.id)); ctx.rerender(); } }, 'Mở rộng tất cả'),
    h('button.btn.btn--sm', { type: 'button', onClick: () => { openSet.clear(); ctx.rerender(); } }, 'Thu gọn tất cả'),
    h(
      'button.btn.btn--sm',
      {
        type: 'button',
        onClick: () => {
          setReportSelection(allSelected ? [] : groups.map((g) => g.id));
        },
      },
      allSelected ? 'Bỏ chọn báo cáo' : 'Chọn tất cả để báo cáo'
    ),
    h('span.spacer', { style: { marginLeft: 'auto' } }),
    h(
      'button.btn.btn--primary.btn--sm',
      {
        type: 'button',
        disabled: selection.size === 0,
        onClick: () => openExportDialog({ selection: new Set(selection), groups }),
      },
      svgIcon(ICONS.export, 14),
      `Xuất báo cáo (${formatInt(selection.size)})`
    )
  );

  const cards = groups.map((group, i) =>
    createQuestionCard({
      group,
      analysis: analyses[i],
      index: i,
      state,
      chartType: chartTypeMap.get(group.id),
      isOpen: openSet.has(group.id),
      selected: selection.has(group.id),
      onToggleOpen: (id) => {
        if (openSet.has(id)) openSet.delete(id);
        else openSet.add(id);
        ctx.rerender();
      },
      onToggleSelect: (id, on) => toggleReportSelection(id, on),
      onChartTypeChange: (id, type) => {
        chartTypeMap.set(id, type);
        const card = root.querySelector(`.qcard[data-group="${CSS.escape(id)}"]`);
        if (card) drawCardChart(card, analyses[groups.findIndex((g) => g.id === id)], type);
      },
    })
  );

  mount(
    root,
    h(
      'div',
      {},
      h(
        'div.page-head',
        {},
        h('div', {}, h('h1', {}, 'Phân tích câu hỏi'), h('p', {}, `${formatInt(groups.length)} câu hỏi. Mỗi câu hỏi có biểu đồ, bảng số liệu và tùy chọn xuất.`)),
        toolbar
      ),
      groups.length ? h('div', {}, cards) : h('div.empty', {}, h('span.empty__icon', {}, svgIcon(ICONS.questions, 24)), h('h2', {}, 'Chưa có câu hỏi'), h('p', {}, 'Nhập dữ liệu khảo sát để bắt đầu phân tích.'))
    )
  );

  // draw charts for open cards after mount
  requestAnimationFrame(() => {
    for (const card of root.querySelectorAll('.qcard')) {
      if (card.dataset.open !== 'true') continue;
      const id = card.dataset.group;
      const analysis = analyses[groups.findIndex((g) => g.id === id)];
      if (analysis) drawCardChart(card, analysis, chartTypeMap.get(id));
    }
  });
}
