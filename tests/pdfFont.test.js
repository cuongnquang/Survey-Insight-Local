import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('chart.js/auto', () => {
  class Chart {
    destroy() {}
    toBase64Image() {
      return 'data:image/png;base64,xx';
    }
  }
  Chart.getChart = () => null;
  Chart.register = () => {};
  return { default: Chart };
});

function fakeDoc() {
  return {
    fonts: [],
    files: {},
    addFileToVFS: vi.fn(function (name, data) {
      this.files[name] = data;
    }),
    addFont: vi.fn(function (file, family, style) {
      this.fonts.push({ file, family, style });
    }),
    setFont: vi.fn(),
  };
}

function okFetch(bytes = [0, 1, 0, 0]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  }));
}

beforeEach(() => {
  vi.resetModules();
});

describe('ensurePdfFont — bundled fonts, loud failure (P1.3)', () => {
  it('loads both fonts from local paths and registers them', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { ensurePdfFont } = await import('../src/export/pdf.js');
    const doc = fakeDoc();
    const res = await ensurePdfFont(doc);
    expect(res.unicode).toBe(true);
    expect(doc.fonts).toHaveLength(2);
    expect(doc.setFont).toHaveBeenCalledWith('Roboto');
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.every((u) => typeof u === 'string' && !/^https?:/.test(u))).toBe(true);
    expect(urls.some((u) => u.includes('Roboto-400Regular.ttf'))).toBe(true);
    expect(urls.some((u) => u.includes('Roboto-700Bold.ttf'))).toBe(true);
  });

  it('throws a clear error (no silent helvetica fallback) when a font is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }))
    );
    const { ensurePdfFont } = await import('../src/export/pdf.js');
    const doc = fakeDoc();
    await expect(ensurePdfFont(doc)).rejects.toThrow(/font/i);
    expect(doc.setFont).not.toHaveBeenCalledWith('helvetica');
  });

  it('retries after a failure instead of caching the rejection', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call <= 2) return { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0, 1, 0, 0]).buffer };
      })
    );
    const { ensurePdfFont } = await import('../src/export/pdf.js');
    await expect(ensurePdfFont(fakeDoc())).rejects.toThrow(/font/i);
    const res = await ensurePdfFont(fakeDoc());
    expect(res.unicode).toBe(true);
  });
});
