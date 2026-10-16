import { h, mount, svgIcon, ICONS } from './dom.js';

let active = null;

function focusables(node) {
  return [
    ...node.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ];
}

export function openModal({
  title,
  body,
  footer,
  size = 'default',
  onClose,
  closeOnBackdrop = true,
} = {}) {
  const root = document.getElementById('modalRoot');
  const previouslyFocused = document.activeElement;

  const closeBtn = h(
    'button.btn.btn--ghost.btn--icon',
    { type: 'button', 'aria-label': 'Đóng', onClick: () => close() },
    svgIcon(ICONS.close)
  );

  const modal = h(
    `div.modal${size === 'narrow' ? '.modal--narrow' : size === 'wide' ? '.modal--wide' : ''}`,
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Hộp thoại' },
    h('div.modal__head', {}, h('h2', {}, title || ''), h('span.spacer'), closeBtn),
    h('div.modal__body', {}, body || ''),
    footer ? h('div.modal__foot', {}, footer) : null
  );

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = focusables(modal);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onBackdrop(e) {
    if (closeOnBackdrop && e.target === root) close();
  }

  function close() {
    if (!active) return;
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('mousedown', onBackdrop);
    active = null;
    root.hidden = true;
    mount(root);
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    onClose?.();
  }

  if (active) active.close();
  active = { close, modal };
  mount(root, modal);
  root.hidden = false;
  root.addEventListener('mousedown', onBackdrop);
  document.addEventListener('keydown', onKey);
  const firstFocus = focusables(modal)[0];
  if (firstFocus) firstFocus.focus();

  return { close, modal, body: modal.querySelector('.modal__body') };
}

export function closeModal() {
  if (active) active.close();
}

export function confirmDialog({ title, message, confirmLabel = 'Xác nhận', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const ref = openModal({
      title,
      size: 'narrow',
      body: h('p', {}, message),
      footer: [
        h('button.btn', { type: 'button', onClick: () => { ref.close(); finish(false); } }, 'Hủy'),
        h(
          `button.btn${danger ? '.btn--danger' : '.btn--primary'}`,
          { type: 'button', onClick: () => { ref.close(); finish(true); } },
          confirmLabel
        ),
      ],
      onClose: () => finish(false),
    });
  });
}
