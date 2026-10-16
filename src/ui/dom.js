export function h(tag, props = {}, ...children) {
  const [name, ...rest] = String(tag).split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const part of rest) {
    if (part.startsWith('#')) el.id = part.slice(1);
    else if (part.startsWith('.')) el.classList.add(part.slice(1));
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class' || key === 'className') {
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => el.classList.add(c));
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key === 'value') {
      el.value = value;
    } else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') {
      el[key] = Boolean(value);
    } else if (key === 'ref' && typeof value === 'function') {
      value(el);
    } else {
      el.setAttribute(key, value);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(parent, ...children) {
  clear(parent);
  appendChildren(parent, children);
  return parent;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function svgIcon(path, size = 18, className) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

export const ICONS = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6V11h-6v9Zm0-16v4h6V4h-6Z',
  questions: 'M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7v.5M12 18h.01M4 5h16v14H4z',
  responses: 'M4 6h16M4 12h16M4 18h10',
  sources: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  sync: 'M20 11a8 8 0 0 0-14-5m0 0V3m0 3h3M4 13a8 8 0 0 0 14 5m0 0v3m0-3h-3',
  export: 'M12 3v12m0-12 4 4m-4-4-4 4M5 21h14',
  chevron: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.5-4.5',
  play: 'M7 5v14l12-7-12-7Z',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1m-1 8a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  check: 'm5 13 4 4L19 7',
  warn: 'M12 9v4m0 4h.01M10.3 4.3 2 19h20L13.7 4.3a2 2 0 0 0-3.4 0Z',
};
