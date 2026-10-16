import { h, mount } from '../dom.js';
import { confirmDialog } from '../modal.js';
import { toastOk, toastErr } from '../toast.js';
import { getState } from '../../core/state.js';
import { updateSettings, loadAll } from '../../core/actions.js';
import { store } from '../../core/store.js';
import { ensurePdfFont } from '../../export/pdf.js';
import { jsPDF } from 'jspdf';
import { formatInt, formatBytes } from '../../utils/format.js';

export function renderSettings(root) {
  const { settings, datasets } = getState();
  const googleInput = h('input', { type: 'text', value: settings.googleClientId || '', placeholder: 'xxxxx.apps.googleusercontent.com' });
  const intervalInput = h('input', { type: 'number', min: '1', value: String(settings.syncIntervalMinutes ?? 15), style: { width: '110px' } });
  const dayFirst = h('input', {
    type: 'checkbox',
    checked: settings.dateDayFirst !== false,
    onChange: (e) => updateSettings({ dateDayFirst: e.target.checked }).then(() => toastOk('Đã lưu định dạng ngày.')),
  });

  const savedBytes = new Blob([JSON.stringify(datasets)]).size;

  mount(
    root,
    h(
      'div',
      {},
      h('div.page-head', {}, h('div', {}, h('h1', {}, 'Cài đặt'), h('p', {}, 'Cấu hình Google OAuth, định dạng ngày và dữ liệu cục bộ.'))),
      h(
        'div.grid-2',
        {},
        h(
          'section.panel',
          {},
          h('div.panel__head', {}, h('h3', {}, 'Google Sheets')),
          h(
            'div.panel__body',
            {},
            h(
              'div.stack.stack-lg',
              {},
              h(
                'div.field',
                {},
                h('label', {}, 'OAuth Client ID'),
                googleInput,
                h('p.small.muted', {}, 'Tạo OAuth Client ID loại “Web application”, thêm nguồn JavaScript được ủy quyền là địa chỉ này (localhost). Xem tệp docs/GOOGLE_SETUP.md.')
              ),
              h(
                'div.hstack',
                {},
                h('button.btn.btn--primary', { type: 'button', onClick: () => updateSettings({ googleClientId: googleInput.value.trim() }).then(() => toastOk('Đã lưu Client ID.')) }, 'Lưu Client ID'),
                h('button.btn.btn--ghost', { type: 'button', onClick: () => { window.open('https://console.cloud.google.com/apis/credentials', '_blank', 'noopener'); } }, 'Mở Google Cloud Console')
              ),
              h('p.small.muted', {}, 'Không có client secret nào được nhập hoặc lưu trong ứng dụng này.')
            )
          )
        ),
        h(
          'section.panel',
          {},
          h('div.panel__head', {}, h('h3', {}, 'Phân tích & định dạng')),
          h(
            'div.panel__body',
            {},
            h(
              'div.stack.stack-lg',
              {},
              h('label.check', {}, dayFirst, ' Ưu tiên định dạng ngày dd/mm/yyyy (ngày trước tháng)'),
              h('div.field', {}, h('label', {}, 'Chu kỳ đồng bộ mặc định (phút)'), intervalInput,
                h('button.btn.btn--sm', { type: 'button', style: { marginTop: '.4rem' }, onClick: () => updateSettings({ syncIntervalMinutes: Math.max(1, Number(intervalInput.value) || 15) }).then(() => toastOk('Đã lưu chu kỳ đồng bộ.')) }, 'Lưu')),
              h(
                'div',
                {},
                h('button.btn', { type: 'button', onClick: () => testPdfFont() }, 'Kiểm tra font PDF tiếng Việt'),
                h('p.small.muted', {}, 'Font Unicode (Roboto) được đóng gói sẵn và nhúng khi xuất PDF, hoạt động cả khi không có mạng.')
              )
            )
          )
        )
      ),
      h(
        'section.panel',
        {},
        h('div.panel__head', {}, h('h3', {}, 'Dữ liệu cục bộ')),
        h(
          'div.panel__body',
          {},
          h(
            'div.stack.stack-lg',
            {},
            h('p', {}, `Đang lưu ${formatInt(datasets.length)} bộ dữ liệu trong IndexedDB của trình duyệt (ước tính ${formatBytes(savedBytes)}).`),
            h('p.small.muted', {}, 'Xóa dữ liệu cục bộ không ảnh hưởng tới tệp Excel/CSV hay bảng tính Google gốc.'),
            h(
              'div.hstack',
              {},
              h(
                'button.btn.btn--danger',
                {
                  type: 'button',
                  onClick: async () => {
                    const ok = await confirmDialog({
                      title: 'Xóa toàn bộ dữ liệu cục bộ',
                      message: 'Xóa tất cả bộ dữ liệu đã nhập khỏi trình duyệt? Không thể hoàn tác.',
                      confirmLabel: 'Xóa tất cả',
                      danger: true,
                    });
                    if (!ok) return;
                    await store.clearDatasets();
                    await loadAll();
                    toastOk('Đã xóa toàn bộ dữ liệu cục bộ.');
                  },
                },
                'Xóa toàn bộ dữ liệu cục bộ'
              )
            )
          )
        )
      ),
      h(
        'section.panel',
        {},
        h('div.panel__head', {}, h('h3', {}, 'Giới thiệu & bảo mật')),
        h(
          'div.panel__body',
          {},
          h(
            'ul.stack',
            { style: { listStyle: 'none', margin: 0, padding: 0 } },
            bullet('Mọi phân tích chạy cục bộ trong trình duyệt. Không có máy chủ trung gian, không gửi dữ liệu khảo sát ra ngoài.'),
            bullet('Token Google chỉ tồn tại trong bộ nhớ phiên làm việc; có thể thu hồi bất cứ lúc nào ở trang Nguồn dữ liệu.'),
            bullet('Báo cáo xuất ra không chứa token, mã xác thực hay thông tin đăng nhập.'),
            bullet('Lưu ý phụ thuộc: gói xlsx có cảnh báo bảo mật (npm audit) — chấp nhận cho công cụ chạy cục bộ, không dùng để xử lý tệp từ nguồn không tin cậy trên máy chủ dùng chung.')
          )
        )
      )
    )
  );
}

function bullet(text) {
  return h('li', { style: { padding: '.3rem 0', borderBottom: '1px solid var(--line)' } }, h('span.small', {}, text));
}

async function testPdfFont() {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await ensurePdfFont(doc);
    toastOk('Font Unicode sẵn sàng — PDF sẽ hiển thị tiếng Việt đúng.');
  } catch (err) {
    toastErr(err.message || String(err));
  }
}
