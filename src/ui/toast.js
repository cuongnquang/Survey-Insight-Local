import { h } from './dom.js';

const root = () => document.getElementById('toasts');

export function toast(message, variant = 'info', timeout = 4200) {
  const host = root();
  if (!host) return;
  const node = h(`div.toast.toast--${variant}`, {}, message);
  host.append(node);
  const remove = () => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .2s ease';
    setTimeout(() => node.remove(), 220);
  };
  if (timeout > 0) setTimeout(remove, timeout);
  return { close: remove };
}

export const toastOk = (m, t) => toast(m, 'ok', t);
export const toastErr = (m, t = 6500) => toast(m, 'err', t);
export const toastWarn = (m, t) => toast(m, 'warn', t);
