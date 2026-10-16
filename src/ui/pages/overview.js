import { h, mount } from '../dom.js';
import { buildOverview } from '../../analysis/overview.js';
import { renderChart, paletteAt } from '../../charts/renderer.js';
import { formatInt, formatPercent, formatDateTime, relativeTime } from '../../utils/format.js';
import { getState } from '../../core/state.js';
import { activeFilterCount } from '../../core/filters.js';

function kpi(label, value, note, accent) {
  return h(
    `div.kpi${accent ? '.kpi--accent' : ''}`,
    {},
    h('div.kpi__label', {}, label),
    h('div.kpi__value', {}, value),
    note ? h('div.kpi__note', {}, note) : null
  );
}

function timelineSpec(timeline) {
  const cumulative = timeline.points.length > 40;
  const points = cumulative ? timeline.cumulative : timeline.points;
  return {
    type: 'line',
    data: {
      labels: points.map((p) => p.key),
      datasets: [
        {
          label: cumulative ? 'Số phản hồi lũy kế' : 'Số phản hồi mỗi ngày',
          data: points.map((p) => p.count),
          borderColor: paletteAt(0),
          backgroundColor: 'rgba(79,70,229,0.14)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: points.length > 60 ? 0 : 2,
          pointBackgroundColor: paletteAt(0),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0f172a', cornerRadius: 8, padding: 10 },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        y: { beginAtZero: true, title: { display: true, text: 'Số phản hồi' } },
      },
    },
  };
}

export function renderOverview(root, ctx) {
  const { dataset, responses } = ctx;
  const overview = buildOverview(dataset, responses);
  const filterCount = activeFilterCount(ctx.state.filters);
  const scopeNote = filterCount ? `Theo ${filterCount} bộ lọc đang áp dụng` : 'Toàn bộ dữ liệu';

  const statusBeacon = beacon(overview);

  const kpiGrid = h(
    'div.kpi-grid',
    {},
    kpi('Tổng số phản hồi', h('span', {}, formatInt(overview.totalResponses)), scopeNote, true),
    kpi('Tổng số câu hỏi', formatInt(overview.totalQuestions), `${formatInt(overview.totalColumns)} cột được phân tích`),
    kpi(
      'Tỷ lệ hoàn thành trung bình',
      formatPercent(overview.completion.avgAnsweredPercent),
      'Số ô có câu trả lời / tổng số ô'
    ),
    kpi(
      'Phản hồi hoàn thành toàn bộ',
      formatPercent(overview.completion.fullyCompletedPercent),
      `${formatInt(overview.completion.fullyCompleted)} phản hồi trả lời mọi câu hỏi`
    ),
    kpi(
      'Câu hỏi có lượt chọn nhiều nhất',
      overview.busiestOption ? formatInt(overview.busiestOption.count) : '—',
      overview.busiestOption
        ? `${overview.busiestOption.option} · ${overview.busiestOption.question}`
        : 'Chưa có câu hỏi lựa chọn'
    ),
    h(
      'div.kpi',
      {},
      h('div.kpi__label', {}, 'Google Sheets'),
      h('div', { style: { marginTop: '.45rem' } }, statusBeacon),
      h('div.kpi__note', {}, overview.sync?.lastSyncAt ? `Đồng bộ ${relativeTime(overview.sync.lastSyncAt)}` : 'Chưa kết nối nguồn Google')
    )
  );

  const timelinePanel = h(
    'section.panel',
    {},
    h(
      'div.panel__head',
      {},
      h('h3', {}, 'Số phản hồi theo thời gian'),
      h('span.spacer'),
      h('span.small.muted', {}, overview.timeline.hasTimeline ? `${overview.timeline.points.length} mốc thời gian` : 'Không có cột thời gian')
    ),
    h(
      'div.panel__body',
      {},
      overview.timeline.hasTimeline && overview.timeline.points.length
        ? h('div.chart-wrap', { style: { height: '300px' } }, h('canvas', { id: 'overview-timeline' }))
        : h(
            'div.chart-empty',
            {},
            'Chưa có cột thời gian. Chọn một cột ngày trong Nguồn dữ liệu hoặc Cài đặt để xem xu hướng.'
          )
    )
  );

  const topPanel = h(
    'section.panel',
    {},
    h('div.panel__head', {}, h('h3', {}, 'Đáp án được chọn nhiều nhất')),
    h(
      'div.panel__body',
      {},
      overview.choicesSummary.length
        ? h(
            'div.table-wrap',
            {},
            h(
              'table.data',
              {},
              h('thead', {}, h('tr', {}, h('th', {}, 'Câu hỏi'), h('th', {}, 'Đáp án'), h('th.num', {}, 'Lượt chọn'), h('th.num', {}, 'Tỷ lệ'))),
              h(
                'tbody',
                {},
                overview.choicesSummary.map((c) =>
                  h(
                    'tr',
                    {},
                    h('td.cellwrap', {}, c.question),
                    h('td.cellwrap', {}, c.option),
                    h('td.num', {}, formatInt(c.count)),
                    h('td.num', {}, c.pct != null ? formatPercent(c.pct) : '—')
                  )
                )
              )
            )
          )
        : h('p.small.muted', {}, 'Chưa có câu hỏi lựa chọn để thống kê.')
    )
  );

  const sourcePanel = h(
    'section.panel',
    {},
    h('div.panel__head', {}, h('h3', {}, 'Nguồn dữ liệu & cấu hình')),
    h(
      'ul',
      { style: { listStyle: 'none', margin: 0, padding: '.2rem .3rem' } },
      infoRow('Loại nguồn', dataset.source?.type === 'sheets' ? 'Google Sheets' : 'Tệp cục bộ'),
      infoRow('Tệp / Bảng tính', dataset.source?.fileName || dataset.source?.spreadsheetId || '—'),
      infoRow('Sheet', dataset.source?.sheetName || '—'),
      infoRow('Nhập lúc', formatDateTime(dataset.source?.importedAt)),
      infoRow('Mã phản hồi', dataset.responseIdColumn ? 'Đã cấu hình (giữ nguyên khi đồng bộ)' : 'Chưa có — dùng so khớp nội dung'),
      infoRow('Cột thời gian', dataset.timestampColumn ? 'Đã cấu hình' : 'Chưa cấu hình')
    )
  );

  const warnings = [];
  if (overview.unknownCount) warnings.push(`${overview.unknownCount} cột chưa xác định loại câu hỏi — hãy chọn thủ công trong Phân tích câu hỏi.`);
  if (!overview.timestampConfigured) warnings.push('Chưa có cột thời gian nên không vẽ được xu hướng theo thời gian.');
  if (overview.completion.required) warnings.push(`Tỷ lệ hoàn thành câu hỏi bắt buộc: ${formatPercent(overview.completion.required.percent)}.`);

  mount(
    root,
    h(
      'div',
      {},
      h(
        'div.page-head',
        {},
        h('div', {}, h('h1', {}, 'Tổng quan'), h('p', {}, `Xem nhanh tình hình khảo sát “${dataset.name}”. ${scopeNote}.`))
      ),
      kpiGrid,
      warnings.length
        ? h(
            'div.callout.callout--warn',
            {},
            h('strong', {}, 'Lưu ý: '),
            warnings.join(' ')
          )
        : null,
      h('div.grid-2', {}, timelinePanel, h('div.stack-lg', {}, topPanel, sourcePanel))
    )
  );

  const timelineCanvas = root.querySelector('#overview-timeline');
  if (timelineCanvas && overview.timeline.points.length) {
    renderChart(timelineCanvas, timelineSpec(overview.timeline));
  }
}

function infoRow(k, v) {
  return h(
    'li',
    { style: { display: 'flex', gap: '1rem', justifyContent: 'space-between', padding: '.35rem .3rem', borderBottom: '1px solid var(--line)' } },
    h('span.small.muted', {}, k),
    h('span.small.mono', { style: { textAlign: 'right', wordBreak: 'break-word' } }, v)
  );
}

function beacon(overview) {
  const s = getState();
  if (s.google.connected) {
    return h('span.beacon', {}, h('span.beacon__dot.beacon__dot--ok'), 'Đã kết nối tài khoản Google');
  }
  if (overview.source?.type === 'sheets') {
    return h('span.beacon', {}, h('span.beacon__dot.beacon__dot--warn'), 'Có nguồn Sheets nhưng chưa xác thực');
  }
  return h('span.beacon', {}, h('span.beacon__dot.beacon__dot--off'), 'Không sử dụng Google Sheets');
}
