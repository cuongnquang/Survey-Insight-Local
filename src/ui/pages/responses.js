import { h, mount, svgIcon, ICONS } from '../dom.js';
import { includedColumns, toDisplayString, countAnswered } from '../../core/model.js';
import { formatInt } from '../../utils/format.js';

let page = 0;
let perPage = 50;

export function renderResponses(root, ctx) {
  const { dataset, responses } = ctx;
  const cols = includedColumns(dataset);
  const total = responses.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  if (page >= pageCount) page = pageCount - 1;
  if (page < 0) page = 0;
  const start = page * perPage;
  const slice = responses.slice(start, start + perPage);
  const columnIds = cols.map((c) => c.id);

  const toolbar = h(
    'div.hstack',
    {},
    h('label.small.muted.hstack', {}, 'Số dòng', h(
      'select',
      {
        onChange: (e) => {
          perPage = Number(e.target.value);
          page = 0;
          ctx.rerender();
        },
      },
      [25, 50, 100, 250].map((n) => h('option', { value: n, selected: n === perPage }, String(n)))
    )),
    h('span.spacer', { style: { marginLeft: 'auto' } }),
    h('span.small.muted', {}, `${formatInt(total)} phản hồi sau bộ lọc`)
  );

  const table = h(
    'div.table-wrap.table-wrap--tall',
    {},
    h(
      'table.data.data--dense',
      {},
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th.num', {}, '#'),
          cols.map((c) => h('th', { title: c.header }, c.name || c.header)),
          h('th.num', {}, 'Trả lời')
        )
      ),
      h(
        'tbody',
        {},
        slice.map((r, i) =>
          h(
            'tr',
            {},
            h('td.num.muted', {}, String(start + i + 1)),
            cols.map((c) => {
              const v = toDisplayString(r.values[c.id]);
              return h('td', { class: v ? '' : 'cellblank' }, v ? h('span.cellwrap', {}, v) : '—');
            }),
            h('td.num', {}, `${countAnswered(r, columnIds)}/${cols.length}`)
          )
        )
      )
    )
  );

  const pager = h(
    'div.hstack',
    {},
    h('button.btn.btn--sm', { type: 'button', disabled: page === 0, onClick: () => { page = 0; ctx.rerender(); } }, '« Đầu'),
    h('button.btn.btn--sm', { type: 'button', disabled: page === 0, onClick: () => { page -= 1; ctx.rerender(); } }, '‹ Trước'),
    h('span.small.mono', {}, `Trang ${page + 1} / ${pageCount}`),
    h('button.btn.btn--sm', { type: 'button', disabled: page >= pageCount - 1, onClick: () => { page += 1; ctx.rerender(); } }, 'Sau ›'),
    h('button.btn.btn--sm', { type: 'button', disabled: page >= pageCount - 1, onClick: () => { page = pageCount - 1; ctx.rerender(); } }, 'Cuối »')
  );

  mount(
    root,
    h(
      'div',
      {},
      h(
        'div.page-head',
        {},
        h('div', {}, h('h1', {}, 'Dữ liệu phản hồi'), h('p', {}, 'Dữ liệu gốc không bị thay đổi. Bảng chỉ hiển thị và lọc, không chỉnh sửa giá trị nguồn.')),
        toolbar
      ),
      total ? h('div', {}, table, pager) : h('div.empty', {}, h('span.empty__icon', {}, svgIcon(ICONS.responses, 24)), h('h2', {}, 'Không có phản hồi'), h('p', {}, 'Không có dòng nào khớp bộ lọc hiện tại.'))
    )
  );
}
