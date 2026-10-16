import { h } from './dom.js';
import { openModal } from './modal.js';
import { toastErr, toastOk } from './toast.js';
import { getState } from '../core/state.js';
import { getFilteredResponses } from '../core/actions.js';
import { generateReportPdf } from '../export/pdf.js';
import { exportExcel } from '../export/excel.js';
import { FILTER_OP_LABEL, activeFilterCount } from '../core/filters.js';
import { includedColumns } from '../core/model.js';
import { formatInt } from '../utils/format.js';

function describeFilters(dataset, filters) {
  if (activeFilterCount(filters) === 0) return 'Toàn bộ dữ liệu';
  const parts = [];
  const name = (id) => includedColumns(dataset).find((c) => c.id === id)?.name || 'cột';
  if (filters.keyword?.trim()) parts.push(`từ khóa "${filters.keyword.trim()}"`);
  if (filters.dateColumnId && (filters.dateFrom || filters.dateTo)) parts.push(`ngày ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`);
  if (filters.groupByColumnId && filters.groups?.length) parts.push(`nhóm ${name(filters.groupByColumnId)} ∈ {${filters.groups.join(', ')}}`);
  for (const c of filters.conditions || []) {
    parts.push(`${name(c.columnId)} ${FILTER_OP_LABEL[c.op] || c.op}${c.value ? ` "${c.value}"` : ''}`);
  }
  return parts.join(' · ');
}

export function openExportDialog({ selection, groups }) {
  const state = getState();
  const { dataset } = state;
  if (!dataset) return;

  const filtered = getFilteredResponses();
  const hasFilters = activeFilterCount(state.filters) > 0;

  const formatRadio = { value: 'pdf' };
  const scopeRadio = { value: hasFilters ? 'filtered' : 'all' };
  let includeData = true;

  const countLabel = h('label', {}, `Câu hỏi trong báo cáo (${formatInt(selection.size)}/${formatInt(groups.length)})`);

  const body = h(
    'div.stack.stack-lg',
    {},
    h(
      'div.field',
      {},
      h('label', {}, 'Định dạng'),
      h(
        'div.stack',
        {},
        radioRow('pdf', 'PDF — báo cáo có biểu đồ và bảng', formatRadio, 'format'),
        radioRow('excel', 'Excel (.xlsx) — nhiều sheet: tổng quan, theo câu hỏi, dữ liệu', formatRadio, 'format')
      )
    ),
    h(
      'div.field',
      {},
      h('label', {}, 'Phạm vi dữ liệu'),
      h(
        'div.stack',
        {},
        radioRow('all', `Toàn bộ dữ liệu (${formatInt(dataset.responses.length)} phản hồi)`, scopeRadio, 'scope'),
        radioRow(
          'filtered',
          hasFilters
            ? `Theo bộ lọc hiện tại (${formatInt(filtered.length)} phản hồi)`
            : 'Theo bộ lọc hiện tại (chưa có bộ lọc — giống toàn bộ)',
          scopeRadio,
          'scope',
          !hasFilters
        )
      )
    ),
    h(
      'div.field',
      {},
      countLabel,
      h(
        'div.pill-list',
        {},
        groups.map((g) =>
          h(
            'label.check.tag',
            {},
            h('input', {
              type: 'checkbox',
              checked: selection.has(g.id),
              onChange: (e) => {
                if (e.target.checked) selection.add(g.id);
                else selection.delete(g.id);
                countLabel.textContent = `Câu hỏi trong báo cáo (${selection.size}/${groups.length})`;
              },
            }),
            g.title
          )
        )
      )
    ),
    h(
      'label.check',
      {},
      h('input', {
        type: 'checkbox',
        checked: true,
        onChange: (e) => {
          includeData = e.target.checked;
        },
      }),
      ' Kèm sheet dữ liệu phản hồi (chỉ Excel)'
    ),
    h('p.small.muted', {}, 'Báo cáo không chứa token, mã xác thực hay thông tin đăng nhập Google.')
  );

  const footer = [
    h('button.btn', { type: 'button', onClick: () => ref.close() }, 'Hủy'),
    h('button.btn.btn--primary', { type: 'button', onClick: () => runExport(), html: 'Xuất báo cáo', 'data-action': 'run' }),
  ];
  const ref = openModal({ title: 'Xuất báo cáo', body, footer, size: 'default' });

  async function runExport() {
    const runBtn = ref.modal.querySelector('[data-action="run"]');
    const responses = scopeRadio.value === 'filtered' ? filtered : dataset.responses;
    const filterSummary = scopeRadio.value === 'filtered' ? describeFilters(dataset, state.filters) : 'Toàn bộ dữ liệu';
    runBtn.disabled = true;
    runBtn.textContent = 'Đang tạo…';
    try {
      if (formatRadio.value === 'excel') {
        exportExcel({
          dataset,
          responses,
          filterSummary,
          includeData,
        });
        toastOk('Đã xuất báo cáo Excel.');
      } else {
        await generateReportPdf({
          dataset,
          responses,
          selection,
          title: `Báo cáo: ${dataset.name}`,
          filterSummary,
        });
        toastOk('Đã xuất báo cáo PDF.');
      }
      ref.close();
    } catch (err) {
      console.error(err);
      toastErr(`Xuất báo cáo thất bại: ${err.message || err}`);
      runBtn.disabled = false;
      runBtn.textContent = 'Xuất báo cáo';
    }
  }
}

function radioRow(value, label, holder, group, disabled) {
  return h(
    'label.check',
    {},
    h('input', {
      type: 'radio',
      name: group,
      value,
      checked: holder.value === value,
      disabled,
      onChange: () => {
        holder.value = value;
      },
    }),
    ` ${label}`
  );
}
