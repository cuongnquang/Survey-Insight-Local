import { h, mount, clear, svgIcon, ICONS } from './dom.js';
import { includedColumns } from '../core/model.js';
import { CHOICE_TYPES, SCALE_TYPES, QTYPE } from '../core/constants.js';
import { FILTER_OP_LABEL, dateFilterIssue, dateFilterStats } from '../core/filters.js';
import { setFilters, clearFilters } from '../core/actions.js';
import { genId } from '../core/model.js';
import { formatInt } from '../utils/format.js';

const OPS_TEXT = ['contains', 'not_contains', 'eq', 'neq', 'not_empty', 'empty'];
const OPS_NUM = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'not_empty', 'empty'];
const OPS_CHOICE = ['eq', 'neq', 'contains', 'not_contains', 'not_empty', 'empty'];
const OPS_DATE = ['gte', 'lte', 'eq', 'not_empty', 'empty'];

function opsForColumn(col) {
  if (!col) return OPS_TEXT;
  if (SCALE_TYPES.has(col.type)) return OPS_NUM;
  if (CHOICE_TYPES.has(col.type) || col.type === QTYPE.GRID_SINGLE || col.type === QTYPE.GRID_MULTIPLE)
    return OPS_CHOICE;
  if (col.type === QTYPE.DATE) return OPS_DATE;
  return OPS_TEXT;
}

const NO_VALUE_OPS = new Set(['empty', 'not_empty']);

const refs = new WeakMap();

export function mountFiltersBar(container, state) {
  clear(container);
  const { dataset, filters } = state;
  if (!dataset) return;
  const columns = includedColumns(dataset);
  const dateCols = columns.filter((c) => c.type === QTYPE.DATE || c.id === dataset.timestampColumn);
  const groupCols = columns.filter((c) => CHOICE_TYPES.has(c.type));

  const keywordInput = h('input', {
    type: 'search',
    placeholder: 'Tìm trong dữ liệu…',
    value: filters.keyword || '',
    'aria-label': 'Từ khóa tìm kiếm',
    onInput: (e) => setFilters({ keyword: e.target.value }),
  });

  const dateColSelect = h(
    'select',
    {
      'aria-label': 'Cột ngày',
      onChange: (e) => setFilters({ dateColumnId: e.target.value || null }),
    },
    [h('option', { value: '' }, '— Không lọc ngày —')],
    dateCols.map((c) => h('option', { value: c.id, selected: filters.dateColumnId === c.id }, c.name || c.header))
  );

  const fromInput = h('input', {
    type: 'date',
    value: filters.dateFrom || '',
    'aria-label': 'Từ ngày',
    onChange: (e) => setFilters({ dateFrom: e.target.value || null }),
  });
  const toInput = h('input', {
    type: 'date',
    value: filters.dateTo || '',
    'aria-label': 'Đến ngày',
    onChange: (e) => setFilters({ dateTo: e.target.value || null }),
  });

  const groupSelect = h(
    'select',
    {
      'aria-label': 'Nhóm theo cột',
      onChange: (e) => {
        setFilters({ groupByColumnId: e.target.value || null, groups: [] });
        mountFiltersBar(container, { ...state, filters: { ...filters, groupByColumnId: e.target.value || null, groups: [] } });
      },
    },
    [h('option', { value: '' }, '— Nhóm theo —')],
    groupCols.map((c) => h('option', { value: c.id, selected: filters.groupByColumnId === c.id }, c.name || c.header))
  );

  const conditionHost = h('div.stack', {}, (filters.conditions || []).map((c) => conditionRow(state, c, container)));

  const addBtn = h(
    'button.btn.btn--sm',
    {
      type: 'button',
      onClick: () => {
        const first = columns[0];
        const cond = { id: genId('f'), columnId: first?.id || '', op: 'contains', value: '' };
        setFilters({ conditions: [...(filters.conditions || []), cond] });
        mountFiltersBar(container, { ...state, filters: { ...filters, conditions: [...(filters.conditions || []), cond] } });
      },
    },
    svgIcon(ICONS.plus, 14),
    'Điều kiện'
  );

  const clearBtn = h(
    'button.btn.btn--sm.btn--danger',
    { type: 'button', onClick: () => clearFilters() },
    'Xóa bộ lọc'
  );

  const chipsHost = h('div.chips', {}, renderChips(state));

  const dayFirst = state.dataset.dateMeta?.dayFirst ?? state.settings?.dateDayFirst !== false;
  const dateColForFilter = filters.dateColumnId ? columns.find((c) => c.id === filters.dateColumnId) : null;
  const issue = dateFilterIssue(filters, { dayFirst });
  const stats = dateFilterStats(state.dataset.responses, dateColForFilter, filters, { dayFirst });
  const notices = [];
  if (issue) notices.push(h('p.small.warn-text', {}, `Lọc ngày: ${issue.issues.join(' ')}`));
  if (stats && stats.undated > 0) {
    notices.push(
      h(
        'p.small.muted',
        {},
        `${formatInt(stats.undated)}/${formatInt(stats.total)} phản hồi không có ngày hợp lệ ở cột này nên bị loại khỏi kết quả lọc theo ngày.`
      )
    );
  }

  const bar = h(
    'div',
    {},
    h(
      'div.filterbar',
      {},
      h('div.field', {}, h('label', {}, 'Từ khóa'), keywordInput),
      dateCols.length
        ? h('div.field', {}, h('label', {}, 'Cột ngày'), dateColSelect)
        : null,
      dateCols.length ? h('div.field', {}, h('label', {}, 'Từ ngày'), fromInput) : null,
      dateCols.length ? h('div.field', {}, h('label', {}, 'Đến ngày'), toInput) : null,
      groupCols.length ? h('div.field', {}, h('label', {}, 'Nhóm theo'), groupSelect) : null,
      h('div.field', {}, h('label', {}, 'Bộ lọc nâng cao'), conditionHost),
      h('div.hstack', {}, addBtn, clearBtn)
    ),
    notices,
    chipsHost
  );

  mount(container, bar);
  refs.set(container, { keywordInput, dateColSelect, fromInput, toInput, groupSelect, chipsHost, conditionHost });
}

function conditionRow(state, cond, container) {
  const columns = includedColumns(state.dataset);
  const col = columns.find((c) => c.id === cond.columnId) || columns[0];
  const ops = opsForColumn(col);
  const row = h(
    'div.hstack',
    {},
    h(
      'select',
      {
        'aria-label': 'Cột điều kiện',
        onChange: (e) => {
          cond.columnId = e.target.value;
          cond.op = opsForColumn(columns.find((c) => c.id === cond.columnId))[0];
          cond.value = '';
          persistConditions(state, container);
        },
      },
      columns.map((c) => h('option', { value: c.id, selected: c.id === cond.columnId }, c.name || c.header))
    ),
    h(
      'select',
      {
        'aria-label': 'Phép so sánh',
        onChange: (e) => {
          cond.op = e.target.value;
          persistConditions(state, container);
        },
      },
      ops.map((op) => h('option', { value: op, selected: op === cond.op }, FILTER_OP_LABEL[op] || op))
    ),
    NO_VALUE_OPS.has(cond.op)
      ? null
      : h('input', {
          type: 'text',
          placeholder: 'Giá trị',
          value: cond.value ?? '',
          'aria-label': 'Giá trị điều kiện',
          onInput: (e) => {
            cond.value = e.target.value;
            persistConditions(state, container, { soft: true });
          },
        }),
    h(
      'button.btn.btn--sm.btn--icon',
      {
        type: 'button',
        'aria-label': 'Xóa điều kiện',
        onClick: () => {
          const conditions = (state.filters.conditions || []).filter((c) => c.id !== cond.id);
          setFilters({ conditions });
          mountFiltersBar(container, { ...state, filters: { ...state.filters, conditions } });
        },
      },
      svgIcon(ICONS.trash, 14)
    )
  );
  row.dataset.condId = cond.id;
  return row;
}

function persistConditions(state, container, { soft } = {}) {
  const rows = [...container.querySelectorAll('[data-cond-id]')];
  const conditions = rows.map((row) => {
    const id = row.dataset.condId;
    const original = (state.filters.conditions || []).find((c) => c.id === id) || { id };
    const selects = row.querySelectorAll('select');
    const input = row.querySelector('input[type="text"]');
    return {
      id,
      columnId: selects[0]?.value || original.columnId,
      op: selects[1]?.value || original.op,
      value: input ? input.value : original.value ?? '',
    };
  });
  setFilters({ conditions });
  if (!soft) mountFiltersBar(container, { ...state, filters: { ...state.filters, conditions } });
}

export function updateFiltersBar(container, state) {
  const r = refs.get(container);
  if (!r) return;
  const active = document.activeElement;
  const sync = (el, value) => {
    if (el !== active && el.value !== (value ?? '')) el.value = value ?? '';
  };
  sync(r.keywordInput, state.filters.keyword || '');
  sync(r.fromInput, state.filters.dateFrom || '');
  sync(r.toInput, state.filters.dateTo || '');
  if (r.dateColSelect) sync(r.dateColSelect, state.filters.dateColumnId || '');
  if (r.groupSelect) sync(r.groupSelect, state.filters.groupByColumnId || '');
  if (r.chipsHost) mount(r.chipsHost, ...renderChips(state));
}

function renderChips(state) {
  const { dataset, filters } = state;
  if (!dataset) return [];
  const chips = [];
  const colName = (id) => includedColumns(dataset).find((c) => c.id === id)?.name || '';

  if (filters.keyword && filters.keyword.trim()) {
    chips.push(chip(`Từ khóa: "${trunc(filters.keyword)}"`, () => setFilters({ keyword: '' })));
  }
  if (filters.dateColumnId && (filters.dateFrom || filters.dateTo)) {
    const range = `${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`;
    chips.push(chip(`Ngày (${colName(filters.dateColumnId)}): ${range}`, () => setFilters({ dateColumnId: null, dateFrom: null, dateTo: null })));
  }
  if (filters.groupByColumnId) {
    chips.push(chip(`Nhóm: ${colName(filters.groupByColumnId)}`, () => setFilters({ groupByColumnId: null, groups: [] })));
    const groupCol = includedColumns(dataset).find((c) => c.id === filters.groupByColumnId);
    if (groupCol) {
      const available = distinctFor(dataset, groupCol);
      for (const val of available.slice(0, 40)) {
        const on = (filters.groups || []).includes(val);
        chips.push(
          h(
            `span.chip`,
            {
              style: on ? { background: 'var(--primary)', color: '#fff' } : {},
              onClick: () => {
                const set = new Set(filters.groups || []);
                if (on) set.delete(val);
                else set.add(val);
                setFilters({ groups: [...set] });
              },
            },
            val
          )
        );
      }
    }
  }
  for (const cond of filters.conditions || []) {
    chips.push(
      chip(
        `${colName(cond.columnId)} ${FILTER_OP_LABEL[cond.op] || cond.op}${NO_VALUE_OPS.has(cond.op) ? '' : ` "${trunc(cond.value)}"`}`,
        () => setFilters({ conditions: (filters.conditions || []).filter((c) => c.id !== cond.id) })
      )
    );
  }
  if (!chips.length) return [h('span.small.muted', {}, 'Chưa áp dụng bộ lọc nào. KPI, bảng và biểu đồ dùng toàn bộ dữ liệu.')];
  return [h('span.small.muted', { style: { alignSelf: 'center' } }, 'Đang lọc:'), ...chips];
}

function chip(label, onRemove) {
  return h(
    'span.chip',
    {},
    label,
    h('button', { type: 'button', 'aria-label': 'Bỏ lọc này', onClick: onRemove }, svgIcon(ICONS.close, 12))
  );
}

function trunc(v, n = 18) {
  const s = String(v ?? '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function distinctFor(dataset, column) {
  const seen = new Set();
  for (const r of dataset.responses) {
    const raw = r.values[column.id];
    if (raw == null || raw === '') continue;
    const parts = CHOICE_TYPES.has(column.type) ? String(raw).split(/[,;\n|]/) : [raw];
    for (const p of parts) {
      const t = String(p).trim();
      if (t) seen.add(t);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export { opsForColumn };
