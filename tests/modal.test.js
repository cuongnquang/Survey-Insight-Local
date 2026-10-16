// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openModal, closeModal } from '../src/ui/modal.js';

const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');

beforeAll(() => {
  document.body.innerHTML = `
    <div id="toasts" class="toasts"></div>
    <div id="modalRoot" class="modal-root" hidden></div>
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
});

describe('modal overlay (P0.3)', () => {
  it('.modal-root[hidden] computes display:none so overlay never blocks the app', () => {
    const root = document.getElementById('modalRoot');
    root.hidden = true;
    expect(getComputedStyle(root).display).toBe('none');
    root.hidden = false;
    expect(getComputedStyle(root).display).not.toBe('none');
  });

  it('.app[hidden] computes display:none', () => {
    const app = document.createElement('div');
    app.className = 'app';
    app.hidden = true;
    document.body.append(app);
    expect(getComputedStyle(app).display).toBe('none');
    app.remove();
  });

  it('open/close toggles hidden and Escape closes the dialog', () => {
    const root = document.getElementById('modalRoot');
    const ref = openModal({ title: 'T', body: 'B' });
    expect(root.hidden).toBe(false);
    expect(root.querySelector('[role="dialog"]')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.hidden).toBe(true);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    ref.close();
  });

  it('removes document keydown listener on close (no listener leak across opens)', () => {
    const root = document.getElementById('modalRoot');
    const added = [];
    const removed = [];
    const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
      if (type === 'keydown') added.push(fn);
      EventTarget.prototype.addEventListener.call(document, type, fn, opts);
    });
    const removeSpy = vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, opts) => {
      if (type === 'keydown') removed.push(fn);
      EventTarget.prototype.removeEventListener.call(document, type, fn, opts);
    });

    const a = openModal({ title: 'A', body: 'x' });
    expect(added).toHaveLength(1);
    a.close();
    expect(removed).toEqual(added);
    expect(root.hidden).toBe(true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('opening a second modal closes the first (single active modal)', () => {
    const root = document.getElementById('modalRoot');
    const first = openModal({ title: 'A', body: 'a' });
    const second = openModal({ title: 'B', body: 'b' });
    expect(root.textContent).toContain('B');
    expect(root.textContent).not.toContain('a');
    second.close();
    expect(root.hidden).toBe(true);
    first.close();
  });

  it('backdrop mousedown closes when closeOnBackdrop is true', () => {
    const root = document.getElementById('modalRoot');
    openModal({ title: 'X', body: 'y' });
    root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(root.hidden).toBe(true);
    closeModal();
  });
});
