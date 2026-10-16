import { h, mount, svgIcon, ICONS } from '../dom.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { toastOk, toastErr, toastWarn } from '../toast.js';
import { getState, setState } from '../../core/state.js';
import {
  addDataset,
  setActiveDataset,
  removeDataset,
  saveDataset,
} from '../../core/actions.js';
import { readFile } from '../../import/parse.js';
import { openImportWizard } from '../importWizard.js';
import { requestAccessToken, revokeToken, fetchUserInfo } from '../../integrations/googleAuth.js';
import { parseSpreadsheetId, getSpreadsheetMeta, getSheetValues } from '../../integrations/googleSheets.js';
import {
  buildResponsesFromRows,
  applySheetSync,
  validateSheetHeader,
  backfillExternalIds,
} from '../../integrations/syncEngine.js';
import { formatInt, formatDateTime, relativeTime } from '../../utils/format.js';
import { QTYPE_LABEL } from '../../core/constants.js';

export function renderSources(root, ctx) {
  const state = getState();
  const { datasets, dataset } = state;

  const fileInput = h('input', {
    type: 'file',
    accept: '.xlsx,.xls,.xlsm,.csv,.tsv,.txt',
    style: { display: 'none' },
    onChange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const parsed = await readFile(file);
        openImportWizard({
          kind: parsed.kind,
          fileName: parsed.fileName,
          sheets: parsed.sheets,
          onConfirm: addDataset,
        });
      } catch (err) {
        toastErr(err.message || String(err));
      }
    },
  });

  mount(
    root,
    h(
      'div',
      {},
      h(
        'div.page-head',
        {},
        h('div', {}, h('h1', {}, 'Nguồn dữ liệu'), h('p', {}, 'Nhập từ tệp Excel/CSV hoặc Google Sheets. Dữ liệu được lưu cục bộ trong trình duyệt.')),
        h(
          'div.hstack',
          {},
          fileInput,
          h('button.btn.btn--primary', { type: 'button', onClick: () => fileInput.click() }, svgIcon(ICONS.sources, 14), 'Nhập từ tệp'),
          h('button.btn', { type: 'button', onClick: () => openSheetImport() }, svgIcon(ICONS.link, 14), 'Nhập từ Google Sheets')
        )
      ),
      googlePanel(),
      datasetsPanel(datasets, dataset),
      dataset ? activeDatasetPanel(dataset, ctx) : null
    )
  );
}

function googlePanel() {
  const { google, settings } = getState();
  const rows = [
    h('div.hstack', {}, h('h3', {}, 'Tài khoản Google'), h('span.spacer', { style: { marginLeft: 'auto' } }),
      google.connected
        ? h('button.btn.btn--sm', { type: 'button', onClick: disconnectGoogle }, 'Ngắt kết nối & thu hồi quyền')
        : h(
            'button.btn.btn--sm.btn--primary',
            {
              type: 'button',
              disabled: !settings.googleClientId || google.status === 'connecting',
              'aria-busy': google.status === 'connecting' ? 'true' : null,
              onClick: connectGoogle,
            },
            google.status === 'connecting' ? 'Đang kết nối…' : 'Kết nối Google'
          )
    ),
  ];
  if (google.connected) {
    rows.push(h('p.small', {}, h('strong', {}, 'Đã kết nối'), ` · ${google.email || 'không rõ email'} · token hết hạn ${relativeTime(google.expiresAt) || 'sau ít phút'}`));
    rows.push(h('p.small.muted', {}, 'Ứng dụng chỉ yêu cầu quyền đọc bảng tính. Không có client secret nào được lưu trong trình duyệt.'));
  } else if (!settings.googleClientId) {
    rows.push(h('p.small.warn-text', {}, 'Chưa cấu hình Google OAuth Client ID. Vào Cài đặt để nhập.'));
  } else {
    rows.push(h('p.small.muted', {}, 'Bấm “Kết nối Google” để cấp quyền đọc bảng tính. Không có dữ liệu nào được gửi đi ngoài các yêu cầu bạn chủ động thực hiện.'));
  }
  return h('section.panel', {}, h('div.panel__body', {}, h('div.stack', {}, rows)));
}

async function connectGoogle() {
  const { settings } = getState();
  setState((s) => ({ google: { ...s.google, status: 'connecting', error: '' } }));
  try {
    const { accessToken, expiresAt } = await requestAccessToken({ clientId: settings.googleClientId });
    let email = '';
    try {
      const info = await fetchUserInfo(accessToken);
      email = info?.email || '';
    } catch {
      /* optional */
    }
    setState((s) => ({ google: { ...s.google, connected: true, accessToken, expiresAt, email, status: 'ready', error: '' } }));
    toastOk('Đã kết nối Google.');
  } catch (err) {
    setState((s) => ({ google: { ...s.google, connected: false, accessToken: null, status: 'error', error: err.message } }));
    toastErr(err.message || String(err));
  }
}

async function disconnectGoogle() {
  const { google } = getState();
  await revokeToken(google.accessToken).catch(() => {});
  setState((s) => ({ google: { ...s.google, connected: false, accessToken: null, expiresAt: 0, email: '', status: 'idle', error: '' } }));
  toastOk('Đã ngắt kết nối Google và thu hồi token.');
}

function datasetsPanel(datasets, active) {
  if (!datasets.length) {
    return h('section.panel', {}, h('div.panel__body', {}, h('p.muted', {}, 'Chưa có bộ dữ liệu nào. Hãy nhập từ tệp hoặc Google Sheets.')));
  }
  return h(
    'section.panel',
    {},
    h('div.panel__head', {}, h('h3', {}, 'Bộ dữ liệu đã lưu'), h('span.spacer'), h('span.small.muted', {}, `${datasets.length} bộ`)),
    h(
      'div.panel__body',
      {},
      h(
        'div.stack',
        {},
        datasets.map((d) =>
          h(
            'div.ds-row',
            { dataset: { active: String(active?.id === d.id) } },
            h(
              'div.stack',
              {},
              h('div.hstack', {}, h('strong', {}, d.name), active?.id === d.id ? h('span.tag.tag--ok', {}, 'Đang dùng') : null),
              h('span.small.muted', {}, `${d.source?.type === 'sheets' ? 'Google Sheets' : d.source?.fileName || 'tệp'} · ${formatInt(d.responses.length)} phản hồi · ${formatInt(d.columns.length)} cột · cập nhật ${formatDateTime(d.updatedAt)}`)
            ),
            h('span.spacer', { style: { marginLeft: 'auto' } }),
            active?.id === d.id ? null : h('button.btn.btn--sm', { type: 'button', onClick: () => setActiveDataset(d.id) }, 'Kích hoạt'),
            h(
              'button.btn.btn--sm.btn--danger',
              {
                type: 'button',
                onClick: async () => {
                  const ok = await confirmDialog({ title: 'Xóa bộ dữ liệu', message: `Xóa “${d.name}” khỏi trình duyệt? Hành động này không xóa tệp hay bảng tính gốc.`, confirmLabel: 'Xóa', danger: true });
                  if (ok) {
                    await removeDataset(d.id);
                    toastOk('Đã xóa bộ dữ liệu.');
                  }
                },
              },
              svgIcon(ICONS.trash, 14)
            )
          )
        )
      )
    )
  );
}

function activeDatasetPanel(dataset, ctx) {
  const cols = dataset.columns || [];
  const idSelect = h(
    'select',
    {
      onChange: (e) => saveDataset({ ...dataset, responseIdColumn: e.target.value || null }).then(() => ctx.rerender()),
    },
    [h('option', { value: '', selected: !dataset.responseIdColumn }, '— Không dùng mã phản hồi —'),
      ...cols.map((c) => h('option', { value: c.id, selected: dataset.responseIdColumn === c.id }, `${c.name || c.header} (${QTYPE_LABEL[c.type] || '?'})`))]
  );
  const tsSelect = h(
    'select',
    {
      onChange: (e) => saveDataset({ ...dataset, timestampColumn: e.target.value || null }).then(() => ctx.rerender()),
    },
    [h('option', { value: '', selected: !dataset.timestampColumn }, '— Không dùng cột thời gian —'),
      ...cols.map((c) => h('option', { value: c.id, selected: dataset.timestampColumn === c.id }, `${c.name || c.header} (${QTYPE_LABEL[c.type] || '?'})`))]
  );

  const body = h(
    'div.stack.stack-lg',
    {},
    h('div.row-inline', {}, inputField('Mã phản hồi (giữ nguyên khi đồng bộ)', idSelect), inputField('Cột thời gian (vẽ xu hướng)', tsSelect)),
    h('p.small.muted', {}, 'Khi có mã phản hồi ổn định, đồng bộ Google Sheets sẽ cập nhật đúng dòng theo mã thay vì so khớp nội dung.'),
    dataset.source?.type === 'sheets' ? syncPanel(dataset, ctx) : null
  );

  return h('section.panel', {}, h('div.panel__head', {}, h('h3', {}, 'Cấu hình bộ dữ liệu đang dùng')), h('div.panel__body', {}, body));
}

function inputField(label, input) {
  return h('div.field', { style: { minWidth: '260px' } }, h('label', {}, label), input);
}

function syncPanel(dataset, ctx) {
  const state = getState();
  const canSync = state.google.connected && dataset.source?.spreadsheetId && dataset.source?.sheetName;
  return h(
    'div.sync-box',
    {},
    h('h4', {}, 'Đồng bộ Google Sheets'),
    h('p.small.muted', {}, `Bảng tính ${dataset.source.spreadsheetId} · sheet “${dataset.source.sheetName}”. Lần đồng bộ gần nhất: ${dataset.sync?.lastSyncAt ? formatDateTime(dataset.sync.lastSyncAt) : 'chưa có'}.`),
    dataset.sync?.lastResult
      ? h('p.small', {}, `Kết quả gần nhất: thêm ${dataset.sync.lastResult.addedCount}, cập nhật ${dataset.sync.lastResult.updatedCount}, xóa ${dataset.sync.lastResult.removedCount}, không đổi ${dataset.sync.lastResult.unchangedCount}.`)
      : null,
    h(
      'div.hstack',
      {},
      h(
        'button.btn.btn--primary.btn--sm',
        { type: 'button', disabled: !canSync, onClick: (e) => runSync(dataset, ctx, e.currentTarget) },
        svgIcon(ICONS.sync, 14),
        'Đồng bộ ngay'
      ),
      !state.google.connected ? h('span.small.muted', {}, 'Cần kết nối Google trước.') : null
    )
  );
}

let syncInFlight = false;

function unsafeDiffMessage(dataset, diff, incoming) {
  const sample = (arr) => {
    const ids = arr.filter((v) => v != null && v !== '').slice(0, 5);
    return ids.length ? ids.join(', ') : 'không có';
  };
  const existingIds = backfillExternalIds(dataset, dataset.responses).map((r) => r.externalId);
  const incomingIds = incoming.map((r) => r.externalId);
  return (
    `Không phản hồi nào khớp giữa bảng tính và dữ liệu đã lưu. ` +
    `Khớp: ${diff.matchedCount} · Thêm mới: ${diff.addedCount} · Cập nhật: ${diff.updatedCount} · ` +
    `Xóa: ${diff.removedCount} · Không có mã: ${diff.unidentifiedCount}. ` +
    `Mã trong bảng tính (ví dụ): ${sample(incomingIds)}. ` +
    `Mã trong dữ liệu đã lưu (ví dụ): ${sample(existingIds)}. ` +
    `Nếu bạn vừa đổi cột mã phản hồi hoặc bảng tính đã thay toàn bộ mã, việc xác nhận sẽ thay dữ liệu cũ theo bảng tính. ` +
    `Hủy để giữ nguyên dữ liệu cũ.`
  );
}

async function runSync(dataset, ctx, btn) {
  const { google } = getState();
  if (!google.connected) {
    toastErr('Chưa kết nối Google.');
    return;
  }
  if (syncInFlight) {
    toastWarn('Đồng bộ đang chạy, hãy đợi thao tác hiện tại hoàn tất.');
    return;
  }
  syncInFlight = true;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }
  try {
    const token = google.accessToken;
    const rows = await getSheetValues(dataset.source.spreadsheetId, dataset.source.sheetName, token);
    const headerRowIndex = dataset.source.headerRowIndex ?? 0;

    const header = validateSheetHeader(dataset, rows, headerRowIndex);
    if (!header.ok) {
      toastErr(header.reason);
      return;
    }

    const incoming = buildResponsesFromRows(dataset, rows, headerRowIndex, header.columnMap);
    const { diff, responses } = applySheetSync(dataset, incoming);

    for (const w of diff.warnings || []) toastWarn(w);

    if (diff.idDomainUnsafe) {
      const ok = await confirmDialog({
        title: 'Mã phản hồi không khớp dữ liệu đã lưu',
        message: unsafeDiffMessage(dataset, diff, incoming),
        confirmLabel: 'Đồng bộ và thay dữ liệu',
        danger: true,
      });
      if (!ok) {
        toastWarn('Đã hủy đồng bộ — dữ liệu cũ được giữ nguyên.');
        return;
      }
    }

    const next = {
      ...dataset,
      responses,
      sync: { ...dataset.sync, lastSyncAt: Date.now(), lastResult: diff },
    };
    await saveDataset(next);
    if (header.ignoredColumns.length) {
      const extra = header.ignoredColumns.slice(0, 6).join(', ');
      const more = header.ignoredColumns.length > 6 ? `… (+${header.ignoredColumns.length - 6})` : '';
      toastWarn(`Bỏ qua ${header.ignoredColumns.length} cột ngoài cấu hình: ${extra}${more}`);
    }
    toastOk(`Đồng bộ xong: thêm ${diff.addedCount}, cập nhật ${diff.updatedCount}, xóa ${diff.removedCount}.`);
    ctx.rerender();
  } catch (err) {
    if (err.status === 401) {
      setState((s) => ({ google: { ...s.google, connected: false, accessToken: null, status: 'error', error: 'Token hết hạn' } }));
    }
    toastErr(`Đồng bộ thất bại: ${err.message || err}`);
  } finally {
    syncInFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
}

function openSheetImport() {
  const { settings, google } = getState();
  if (!settings.googleClientId) {
    toastErr('Chưa cấu hình Google OAuth Client ID. Vào Cài đặt để nhập trước.');
    return;
  }

  const urlInput = h('input', { type: 'text', placeholder: 'Dán URL hoặc ID bảng tính…' });
  const body = h(
    'div.stack',
    {},
    h('p.muted', {}, 'Dán liên kết bảng tính Google Sheets. Ứng dụng sẽ đọc dữ liệu ở chế độ chỉ đọc.'),
    urlInput,
    !google.connected ? h('p.small.warn-text', {}, 'Bạn cần kết nối Google trước khi nhập. Hãy bấm Kết nối ở trên.') : null
  );
  const footer = [
    h('button.btn', { type: 'button', onClick: () => closeModal() }, 'Hủy'),
    h(
      'button.btn.btn--primary',
      {
        type: 'button',
        disabled: !google.connected,
        onClick: () => {
          const id = parseSpreadsheetId(urlInput.value);
          if (!id) {
            toastErr('Không nhận diện được ID bảng tính từ liên kết.');
            return;
          }
          closeModal();
          loadSheetPicker(id, urlInput.value);
        },
      },
      'Tiếp tục'
    ),
  ];
  openModal({ title: 'Nhập từ Google Sheets', body, footer });
}

async function loadSheetPicker(spreadsheetId, url) {
  const { google } = getState();
  try {
    const meta = await getSpreadsheetMeta(spreadsheetId, google.accessToken);
    const sheetRadio = { value: meta.sheets[0]?.title || '' };
    const list = h(
      'div.stack',
      {},
      meta.sheets.map((s) =>
        h(
          'label.check',
          {},
          h('input', {
            type: 'radio',
            name: 'gsheet',
            checked: sheetRadio.value === s.title,
            onChange: () => {
              sheetRadio.value = s.title;
            },
          }),
          ` ${s.title} (${s.rows ?? '?'} hàng × ${s.cols ?? '?'} cột)`
        )
      )
    );
    const footer = [
      h('button.btn', { type: 'button', onClick: () => closeModal() }, 'Hủy'),
      h(
        'button.btn.btn--primary',
        {
          type: 'button',
          onClick: async () => {
            const title = sheetRadio.value;
            closeModal();
            try {
              const rows = await getSheetValues(spreadsheetId, title, google.accessToken);
              openImportWizard({
                kind: 'sheets',
                fileName: meta.title || 'Google Sheets',
                sheets: [{ name: title, rows }],
                spreadsheetId,
                spreadsheetUrl: url,
                defaultName: meta.title || title,
                onConfirm: addDataset,
              });
            } catch (err) {
              toastErr(err.message || String(err));
            }
          },
        },
        'Đọc sheet'
      ),
    ];
    openModal({
      title: `Chọn sheet — ${meta.title || spreadsheetId}`,
      body: h('div.stack', {}, h('p.muted', {}, 'Chọn sheet chứa dữ liệu phản hồi.'), list),
      footer,
    });
  } catch (err) {
    toastErr(`Không đọc được bảng tính: ${err.message || err}`);
  }
}
