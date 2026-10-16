import { h, svgIcon, ICONS, clear } from './dom.js';
import { QTYPE_LABEL, QTYPE } from '../core/constants.js';
import { availableChartTypes, buildChartSpec, chooseChart, renderChart, destroyChart, chartPngFromCanvas } from '../charts/renderer.js';
import { downloadDataUrl } from '../export/download.js';
import { formatInt, formatNum, formatPercent, truncate } from '../utils/format.js';
import { searchTexts } from '../analysis/text.js';

const CHART_LABEL = {
  bar: 'Cột',
  barH: 'Thanh ngang',
  pie: 'Tròn',
  doughnut: 'Vành khuyên',
  line: 'Đường',
  histogram: 'Phân bố',
  matrix: 'Ma trận',
  table: 'Bảng',
};

export function createQuestionCard({ group, analysis, index, chartType, onChartTypeChange, onToggleSelect, onToggleOpen, isOpen, selected }) {
  const canvasId = `chart-${group.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const types = availableChartTypes(analysis);
  const activeType = chartType || chooseChart(analysis);

  const head = h(
    'div.qcard__head',
    {
      role: 'button',
      tabindex: '0',
      'aria-expanded': String(isOpen),
      onClick: () => onToggleOpen(group.id),
      onKeydown: (e) => {
        if (e.target.closest('input, select, textarea, button, label')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleOpen(group.id);
        }
      },
    },
    h('span.qcard__idx.mono', {}, String(index + 1).padStart(2, '0')),
    h(
      'div.qcard__title',
      {},
      h('h3', { title: group.title }, group.title || '(chưa đặt tên)'),
      h(
        'div.qcard__tags',
        {},
        h('span.tag.tag--type', {}, group.gridBase ? 'Câu hỏi lưới' : QTYPE_LABEL[group.columns[0].type] || 'Chưa xác định'),
        analysis.valid != null ? h('span.tag', {}, `${formatInt(analysis.valid)} hợp lệ`) : null,
        analysis.blank ? h('span.tag.tag--warn', {}, `${formatInt(analysis.blank)} trống`) : null,
        analysis.invalid ? h('span.tag.tag--err', {}, `${formatInt(analysis.invalid)} không hợp lệ`) : null,
        group.columns[0].type === QTYPE.UNKNOWN && !group.gridBase
          ? h('span.tag.tag--err', {}, 'Cần chọn loại')
          : null
      )
    ),
    h(
      'label.check',
      { onClick: (e) => e.stopPropagation() },
      h('input', {
        type: 'checkbox',
        checked: selected,
        'aria-label': 'Chọn câu hỏi để xuất báo cáo',
        onChange: (e) => onToggleSelect(group.id, e.target.checked),
      }),
      h('span.small.muted', {}, 'Báo cáo')
    ),
    svgIcon(ICONS.chevron, 18, 'qcard__chevron')
  );

  const body = h('div.qcard__body', {}, buildBody({ group, analysis, canvasId, types, activeType, onChartTypeChange }));

  return h(
    'article.qcard',
    { dataset: { open: String(isOpen), group: group.id } },
    head,
    body
  );
}

function stat(k, v) {
  return h('div.stat', {}, h('span.stat__k', {}, k), h('span.stat__v.mono', {}, v));
}

function buildBody({ group, analysis, canvasId, types, activeType, onChartTypeChange }) {
  if (analysis.kind === 'text') {
    return buildTextBody({ group, analysis });
  }

  const stats = h('div.stat-row', {}, buildStats(analysis));
  const chartBox = h(
    'div.chart-wrap',
    { style: { height: '300px' } },
    h('canvas', { id: canvasId, height: '300', 'data-chart-group': group.id })
  );
  const controls = h(
    'div.hstack',
    { style: { marginTop: '0.5rem' } },
    types.length > 1
      ? h(
          'label.small.muted.hstack',
          {},
          'Biểu đồ',
          h(
            'select',
            {
              'aria-label': 'Chọn loại biểu đồ',
              onChange: (e) => onChartTypeChange(group.id, e.target.value),
            },
            types.map((t) => h('option', { value: t, selected: t === activeType }, CHART_LABEL[t] || t))
          )
        )
      : null,
    h(
      'button.btn.btn--sm',
      {
        type: 'button',
        onClick: () => {
          const canvas = document.getElementById(canvasId);
          const png = canvas && chartPngFromCanvas(canvas);
          if (png) downloadDataUrl(png, `bieu-do-${group.id}.png`);
        },
      },
      svgIcon(ICONS.download, 14),
      'PNG'
    )
  );
  const table = buildTable(analysis);
  const note = analysis.note ? h('p.chart-note', {}, analysis.note) : null;

  return h(
    'div',
    {},
    stats,
    h('div.qcard__grid', {}, h('div', {}, chartBox, note, controls), h('div', {}, table))
  );
}

function buildStats(analysis) {
  if (analysis.kind === 'scale') {
    return [
      stat('Hợp lệ', formatInt(analysis.valid)),
      stat('Trống', formatInt(analysis.blank)),
      stat('Không hợp lệ', formatInt(analysis.invalid)),
      stat('Trung bình', formatNum(analysis.mean)),
      stat('Trung vị', formatNum(analysis.median)),
      stat('Thấp nhất', analysis.min ?? '—'),
      stat('Cao nhất', analysis.max ?? '—'),
    ];
  }
  if (analysis.kind === 'date') {
    return [
      stat('Hợp lệ', formatInt(analysis.valid)),
      stat('Trống', formatInt(analysis.blank)),
      stat('Không hợp lệ', formatInt(analysis.invalid)),
      stat('Sớm nhất', analysis.min ? new Date(analysis.min).toLocaleDateString('vi-VN') : '—'),
      stat('Muộn nhất', analysis.max ? new Date(analysis.max).toLocaleDateString('vi-VN') : '—'),
    ];
  }
  if (analysis.kind === 'grid') {
    return [stat('Tổng phản hồi', formatInt(analysis.total)), stat('Số hàng', formatInt(analysis.rows.length)), stat('Số lựa chọn', formatInt(analysis.choices.length))];
  }
  return [
    stat('Tổng phản hồi', formatInt(analysis.total)),
    stat('Hợp lệ', formatInt(analysis.valid)),
    stat('Trống', formatInt(analysis.blank)),
    stat('Số đáp án', formatInt(analysis.categories?.length || 0)),
  ];
}

function buildTable(analysis) {
  if (analysis.kind === 'grid') {
    const head = ['Hàng', ...analysis.choices.slice(0, 8).map((c) => c.value)];
    const rows = analysis.rows.map((r) => [
      r.inner,
      ...analysis.choices.slice(0, 8).map((ch) => {
        const found = r.categories.find((c) => c.value === ch.value);
        return found ? formatInt(found.count) : '0';
      }),
    ]);
    return tableEl(head, rows);
  }
  const cats = analysis.categories || analysis.distribution || analysis.byDay || [];
  const head = ['Giá trị', 'Số lượng', 'Tỷ lệ'];
  const maxCount = Math.max(1, ...cats.map((c) => c.count));
  const rows = cats.map((c) => ({
    bar: c.count / maxCount,
    cells: [String(c.value ?? c.key), formatInt(c.count), c.pct != null ? formatPercent(c.pct) : ''],
  }));
  return h(
    'div.table-wrap',
    {},
    h(
      'table.data',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, head[0]), h('th.num', {}, head[1]), h('th.num', {}, head[2]))),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            {},
            h('td', {}, h('div.bar-cell', {}, h('div.bar-cell__fill', { style: { width: `${Math.round(r.bar * 100)}%` } }), h('span.bar-cell__label', {}, truncate(r.cells[0], 40)))),
            h('td.num', {}, r.cells[1]),
            h('td.num', {}, r.cells[2])
          )
        )
      )
    )
  );
}

function tableEl(head, rows) {
  return h(
    'div.table-wrap',
    {},
    h(
      'table.data',
      {},
      h('thead', {}, h('tr', {}, head.map((hd, i) => h(i === 0 ? 'th' : 'th.num', {}, hd)))),
      h(
        'tbody',
        {},
        rows.map((row) =>
          h('tr', {}, row.map((cell, i) => h(i === 0 ? 'td' : 'td.num', {}, cell)))
        )
      )
    )
  );
}

function buildTextBody({ group, analysis }) {
  let entries = analysis.entries;
  const listEl = h('ul.listen-list', {}, entries.slice(0, 60).map((e) => h('li', {}, e.value)));

  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Tìm trong câu trả lời…',
    'aria-label': 'Tìm trong câu trả lời',
    onInput: (e) => {
      entries = searchTexts(analysis.entries, e.target.value);
      clear(listEl);
      entries.slice(0, 60).forEach((en) => listEl.append(h('li', {}, en.value)));
    },
  });

  const kwChart = h(
    'div.chart-wrap',
    { style: { height: '320px' } },
    h('canvas', { id: `chart-${group.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`, height: '320', 'data-chart-group': group.id })
  );

  return h(
    'div.stack.stack-lg',
    {},
    h(
      'div.stat-row',
      {},
      stat('Hợp lệ', formatInt(analysis.valid)),
      stat('Trống', formatInt(analysis.blank)),
      stat('Giá trị khác nhau', formatInt(analysis.unique)),
      stat('Nhóm tương tự', formatInt(analysis.groups.length)),
      analysis.length.mean != null ? stat('Độ dài TB', formatNum(analysis.length.mean)) : null
    ),
    h(
      'div.qcard__grid',
      {},
      h(
        'div',
        {},
        h('h4.small.muted', {}, 'Từ khóa phổ biến (đã bỏ dấu câu và từ dừng)'),
        kwChart
      ),
      h(
        'div',
        {},
        h('h4.small.muted', {}, 'Câu trả lời trùng nội dung'),
        analysis.duplicates.length
          ? h(
              'div.table-wrap',
              {},
              h(
                'table.data',
                {},
                h('thead', {}, h('tr', {}, h('th', {}, 'Nội dung (đã chuẩn hóa)'), h('th.num', {}, 'Số lần'))),
                h(
                  'tbody',
                  {},
                  analysis.duplicates.map((d) => h('tr', {}, h('td.cellwrap', {}, truncate(d.value, 80)), h('td.num', {}, formatInt(d.count))))
                )
              )
            )
          : h('p.small.muted', {}, 'Không có câu trả lời trùng nội dung.')
      )
    ),
    h(
      'details.disclosure',
      {},
      h('summary', {}, `Nhóm câu trả lời tương tự (${analysis.groups.length})`),
      analysis.groups.length
        ? h(
            'div.stack',
            { style: { marginTop: '0.5rem' } },
            analysis.groups.slice(0, 20).map((g) =>
              h(
                'details.disclosure',
                {},
                h('summary', {}, `${truncate(g.label, 70)} — ${g.count} câu`),
                h('ul.listen-list', {}, g.items.map((it) => h('li', {}, it.value)))
              )
            )
          )
        : h('p.small.muted', {}, 'Không đủ câu trả lời tương tự để nhóm.')
    ),
    h(
      'details.disclosure',
      {},
      h('summary', {}, `Xem tất cả câu trả lời (${analysis.valid})`),
      h('div.stack', { style: { marginTop: '0.5rem' } }, searchInput, listEl)
    ),
    analysis.kind === 'text'
      ? h(
          'div.hstack',
          {},
          h(
            'button.btn.btn--sm',
            {
              type: 'button',
              onClick: () => {
                const canvas = document.getElementById(`chart-${group.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
                const png = canvas && chartPngFromCanvas(canvas);
                if (png) downloadDataUrl(png, `tu-khoa-${group.id}.png`);
              },
            },
            svgIcon(ICONS.download, 14),
            'PNG từ khóa'
          )
        )
      : null
  );
}

export function drawCardChart(cardEl, analysis, chartType) {
  const group = cardEl.dataset.group;
  const canvas = cardEl.querySelector(`canvas[data-chart-group="${CSS.escape(group)}"]`);
  if (!canvas || !analysis) return;
  const spec = buildChartSpec(analysis, chartType || chooseChart(analysis));
  if (!spec) {
    destroyChart(canvas);
    const wrap = canvas.parentElement;
    clear(wrap);
    wrap.append(h('div.chart-empty', {}, 'Không đủ dữ liệu để vẽ biểu đồ.'));
    return;
  }
  renderChart(canvas, spec);
}
