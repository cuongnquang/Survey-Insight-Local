import { h, mount } from './dom.js';
import { openModal } from './modal.js';
import { toastErr, toastOk } from './toast.js';
import { getState } from '../core/state.js';
import { QTYPE, QTYPE_LABEL, SEPARATOR_LABEL, CHOICE_TYPES } from '../core/constants.js';
import {
  buildRawTable,
  buildColumnSpecs,
  detectHeaderRow,
  suggestIdColumn,
  suggestTimestampColumn,
  recomputeColumnOptions,
  buildDataset,
} from '../import/normalize.js';
import { truncate } from '../utils/format.js';

const TYPE_OPTIONS = Object.values(QTYPE);
const MULTI_TYPES = new Set([QTYPE.MULTIPLE_CHOICE, QTYPE.GRID_MULTIPLE]);
const SCALE_TYPES_LOCAL = new Set([QTYPE.LINEAR_SCALE, QTYPE.RATING]);

export function openImportWizard({
  kind = 'file',
  fileName = '',
  sheets,
  spreadsheetId = '',
  spreadsheetUrl = '',
  defaultName = '',
  onConfirm,
}) {
  const dayFirst = getState().settings?.dateDayFirst !== false;
  const state = {
    kind,
    fileName,
    spreadsheetId,
    spreadsheetUrl,
    sheets,
    dayFirst,
    sheetIndex: 0,
    rows: [],
    headerRowIndex: 0,
    rawTable: null,
    columnSpecs: [],
    responseIdHeader: null,
    timestampHeader: null,
    surveyName: defaultName || fileName.replace(/\.[^.]+$/, '') || 'Khảo sát',
    step: sheets.length > 1 ? 0 : 1,
    includeData: true,
  };

  let backBtn = null;
  let nextBtn = null;
  let columnListEl = null;

  const ref = openModal({
    title: 'Nhập dữ liệu khảo sát',
    size: 'wide',
    body: h('div.stack', {}),
    footer: buildFooter(),
  });
  const body = ref.body;

  function updateFooter() {
    if (backBtn) backBtn.textContent = state.step > 0 ? 'Quay lại' : 'Hủy';
    if (nextBtn) nextBtn.textContent = state.step >= 2 ? 'Xác nhận nhập' : 'Tiếp tục';
  }

  function loadSheet(index) {
    state.sheetIndex = index;
    state.rows = state.sheets[index]?.rows || [];
    state.headerRowIndex = detectHeaderRow(state.rows);
    rescan();
  }

  function rescan() {
    state.rawTable = buildRawTable(state.rows, state.headerRowIndex);
    state.columnSpecs = buildColumnSpecs(
      state.rawTable.headers,
      state.rawTable.dataRows,
      { dayFirst: state.dayFirst }
    );
    state.responseIdHeader = suggestIdColumn(state.rawTable.headers);
    state.timestampHeader = suggestTimestampColumn(state.rawTable.headers);
    render();
  }

  function buildFooter() {
    const back = h(
      'button.btn',
      {
        type: 'button',
        onClick: () => {
          if (state.step > 0) {
            state.step -= 1;
            render();
          } else {
            ref.close();
          }
        },
      },
      state.step > 0 ? 'Quay lại' : 'Hủy'
    );
    const next = h(
      'button.btn.btn--primary',
      { type: 'button', onClick: onNext },
      state.step >= 2 ? 'Xác nhận nhập' : 'Tiếp tục'
    );
    backBtn = back;
    nextBtn = next;
    return [back, next];
  }

  function onNext() {
    try {
      if (state.step === 0) {
        loadSheet(state.sheetIndex);
        state.step = 1;
        render();
      } else if (state.step === 1) {
        state.step = 2;
        render();
      } else {
        confirmImport();
      }
    } catch (err) {
      toastErr(err.message || String(err));
    }
  }

  function confirmImport() {
    if (!state.rawTable) return;
    const includedCols = state.columnSpecs.filter((c) => c.included);
    if (includedCols.length === 0) {
      toastErr('Cần chọn ít nhất một cột để phân tích.');
      return;
    }
    const dataset = buildDataset({
      name: state.surveyName.trim() || 'Khảo sát',
      source: {
        type: state.kind,
        fileName: state.fileName,
        sheetName: state.sheets[state.sheetIndex]?.name || '',
        spreadsheetId: state.spreadsheetId,
        spreadsheetUrl: state.spreadsheetUrl,
        headerRowIndex: state.headerRowIndex,
        importedAt: Date.now(),
      },
      rawTable: state.rawTable,
      columnSpecs: state.columnSpecs,
      responseIdHeader: state.responseIdHeader,
      timestampHeader: state.timestampHeader,
      dayFirst: state.dayFirst,
    });
    ref.close();
    Promise.resolve(onConfirm?.(dataset))
      .then(() => toastOk(`Đã nhập ${dataset.responses.length} phản hồi từ ${dataset.columns.length} cột.`))
      .catch((err) => toastErr(err.message || String(err)));
  }

  function stepBar() {
    const labels = ['Chọn sheet', 'Kiểm tra tiêu đề', 'Cấu hình cột'];
    if (state.sheets.length <= 1) labels.shift();
    const current = state.sheets.length > 1 ? state.step : state.step;
    const adjusted = state.sheets.length > 1 ? current : current - 1;
    return h(
      'div.steps',
      {},
      labels.map((label, i) =>
        h(
          `div.step`,
          { dataset: { state: i === adjusted ? 'current' : i < adjusted ? 'done' : 'todo' } },
          h('span.step__n', {}, String(i + 1)),
          label
        )
      )
    );
  }

  function render() {
    const children = [stepBar()];
    if (state.step === 0) children.push(renderSheetChoice());
    else if (state.step === 1) children.push(renderHeaderStep());
    else children.push(renderColumnStep());
    mount(body, h('div.stack.stack-lg', {}, children));
    updateFooter();
  }

  function renderSheetChoice() {
    return h(
      'div.stack',
      {},
      h('p.muted', {}, 'Tệp có nhiều sheet. Chọn sheet chứa dữ liệu phản hồi cần phân tích.'),
      h(
        'div.stack',
        {},
        state.sheets.map((s, i) =>
          h(
            'label.check',
            {},
            h('input', {
              type: 'radio',
              name: 'sheet',
              checked: state.sheetIndex === i,
              onChange: () => {
                state.sheetIndex = i;
                render();
              },
            }),
            ` ${s.name} (${s.rows.length} hàng)`
          )
        )
      )
    );
  }

  function renderHeaderStep() {
    const previewRows = state.rows.slice(0, 6);
    return h(
      'div.stack.stack-lg',
      {},
      h('div.field', {}, h('label', {}, 'Tên khảo sát'), h('input', {
        type: 'text',
        value: state.surveyName,
        onInput: (e) => {
          state.surveyName = e.target.value;
        },
      })),
      h(
        'div.row-inline',
        {},
        h(
          'div.field',
          {},
          h('label', {}, 'Hàng tiêu đề'),
          h('input', {
            type: 'number',
            min: '0',
            value: state.headerRowIndex,
            style: { width: '110px' },
            onChange: (e) => {
              state.headerRowIndex = Math.max(0, Number(e.target.value) || 0);
              rescan();
            },
          })
        ),
        h('div.field', {}, h('label', {}, 'Sheet'), h('span.mono.small', {}, state.sheets[state.sheetIndex]?.name || '')),
        h('button.btn', { type: 'button', onClick: rescan }, 'Quét lại')
      ),
      h('p.small.muted', {}, 'Xác nhận hàng tiêu đề đúng. Các cột phía dưới được nhận diện tự động, bạn có thể sửa ở bước sau.'),
      h(
        'div.table-wrap.preview-table',
        {},
        h(
          'table.data',
          {},
          h('thead', {}, h('tr', {}, state.rawTable.headers.map((hd, i) => h('th', {}, `${i + 1}. ${truncate(hd, 22)}`)))),
          h(
            'tbody',
            {},
            previewRows.map((row) =>
              h('tr', {}, state.rawTable.headers.map((_, ci) => h('td.cellwrap', {}, truncate(row[ci] ?? '', 30))))
            )
          )
        )
      )
    );
  }

  function renderColumnStep() {
    return h(
      'div.stack',
      {},
      h(
        'div.callout',
        {},
        `Nhận diện ${state.columnSpecs.length} cột từ ${state.rawTable.dataRows.length} hàng dữ liệu. Bỏ chọn cột không cần phân tích. Loại câu hỏi được suy đoán tự động và có thể điều chỉnh.`
      ),
      h(
        'div.row-inline',
        {},
        h(
          'label.check',
          {},
          h('input', {
            type: 'checkbox',
            checked: true,
            onChange: (e) => {
              const on = e.target.checked;
              state.columnSpecs.forEach((c) => {
                c.included = on;
              });
              renderColumnList();
            },
          }),
          ' Chọn tất cả'
        )
      ),
      h('div.col-config', { ref: (n) => (columnListEl = n) }, columnRows())
    );
  }

  function columnRows() {
    return state.columnSpecs.map((col, index) => {
      const row = h(
        'div.col-config__row',
        { dataset: { included: String(col.included) } },
        h('label.check', {}, h('input', {
          type: 'checkbox',
          checked: col.included,
          onChange: (e) => {
            col.included = e.target.checked;
            row.dataset.included = String(col.included);
          },
        })),
        h('div.stack', {}, 
          h('input', {
            type: 'text',
            value: col.name,
            title: col.header,
            onInput: (e) => {
              col.name = e.target.value;
            },
          }),
          h('span.sample-vals', {}, col.sampleValues.join(' · ') || 'không có giá trị mẫu')
        ),
        h(
          'select',
          {
            onChange: (e) => {
              col.type = e.target.value;
              if (MULTI_TYPES.has(col.type) && !col.options.length) {
                col.options = recomputeColumnOptions(col.header, state.rawTable.dataRows, index, col.separator, col.customSeparator);
              }
              renderColumnList();
            },
          },
          TYPE_OPTIONS.map((t) => h('option', { value: t, selected: col.type === t }, QTYPE_LABEL[t]))
        ),
        renderExtraConfig(col, index),
        h('span.tag', { title: col.notes }, col.gridBase ? 'Lưới' : CHOICE_TYPES.has(col.type) ? 'Lựa chọn' : '')
      );
      return row;
    });
  }

  function renderExtraConfig(col, index) {
    if (MULTI_TYPES.has(col.type)) {
      return h(
        'select',
        {
          onChange: (e) => {
            col.separator = e.target.value;
            col.options = recomputeColumnOptions(col.header, state.rawTable.dataRows, index, col.separator, col.customSeparator);
          },
        },
        Object.entries(SEPARATOR_LABEL).map(([k, label]) =>
          h('option', { value: k, selected: col.separator === k }, label)
        )
      );
    }
    if (SCALE_TYPES_LOCAL.has(col.type)) {
      const min = col.scale?.min ?? 1;
      const max = col.scale?.max ?? 5;
      return h(
        'div.hstack',
        {},
        h('input', {
          type: 'number',
          value: min,
          style: { width: '64px' },
          title: 'Điểm thấp nhất',
          onChange: (e) => {
            col.scale = { min: Number(e.target.value), max: col.scale?.max ?? max };
          },
        }),
        h('span.small.muted', {}, '–'),
        h('input', {
          type: 'number',
          value: max,
          style: { width: '64px' },
          title: 'Điểm cao nhất',
          onChange: (e) => {
            col.scale = { min: col.scale?.min ?? min, max: Number(e.target.value) };
          },
        })
      );
    }
    return h('span.small.muted', {}, '');
  }

  function renderColumnList() {
    if (columnListEl) mount(columnListEl, columnRows());
  }

  loadSheet(state.sheets.length > 1 ? state.sheetIndex : 0);
  if (state.sheets.length <= 1) state.step = 1;
  render();

  return ref;
}
