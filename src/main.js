import { loadAll } from './core/actions.js';
import { initApp } from './ui/app.js';
import { toastErr, toastWarn } from './ui/toast.js';

async function boot() {
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    toastWarn('Không đọc được dữ liệu đã lưu. Ứng dụng vẫn chạy nhưng bộ dữ liệu cũ có thể không hiển thị.');
  }
  try {
    initApp();
  } catch (err) {
    console.error(err);
    toastErr(`Khởi động thất bại: ${err.message || err}`);
  }
}

boot();
