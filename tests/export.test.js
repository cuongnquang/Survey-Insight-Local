import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from '../src/export/excel.js';
import { makeColumn, makeDataset, makeResponse } from '../src/core/model.js';
import { QTYPE } from '../src/core/constants.js';

function sampleDataset() {
  const c1 = makeColumn({ header: 'Giới tính', type: QTYPE.SINGLE_CHOICE, options: ['Nam', 'Nữ'] });
  const c2 = makeColumn({ header: 'Điểm', type: QTYPE.LINEAR_SCALE, scale: { min: 1, max: 5 } });
  const dataset = makeDataset({
    name: 'Khảo sát',
    source: { type: 'file', fileName: 'demo.xlsx' },
    columns: [c1, c2],
    responses: [
      makeResponse({ [c1.id]: 'Nam', [c2.id]: 4 }),
      makeResponse({ [c1.id]: 'Nữ', [c2.id]: 5 }),
    ],
  });
  return { dataset, c1, c2 };
}

describe('buildWorkbook (excel export)', () => {
  it('produces overview, per-question and data sheets', () => {
    const { dataset } = sampleDataset();
    const wb = buildWorkbook({ dataset, responses: dataset.responses });
    expect(wb.SheetNames).toEqual(['Tổng quan', 'Theo câu hỏi', 'Dữ liệu phản hồi']);
  });

  it('omits the data sheet when includeData is false', () => {
    const { dataset } = sampleDataset();
    const wb = buildWorkbook({ dataset, responses: dataset.responses, includeData: false });
    expect(wb.SheetNames).toEqual(['Tổng quan', 'Theo câu hỏi']);
  });

  it('serializes to xlsx bytes', () => {
    const { dataset } = sampleDataset();
    const wb = buildWorkbook({ dataset, responses: dataset.responses });
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    expect(out.byteLength).toBeGreaterThan(0);
  });
});
