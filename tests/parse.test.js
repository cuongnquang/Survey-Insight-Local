import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  decodeBuffer,
  parseCSVText,
  fileExtension,
  isExcelFile,
  isCsvLikeFile,
  readFile,
} from '../src/import/parse.js';

const enc = (s) => new TextEncoder().encode(s);

function fakeFile(name, buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return { name, arrayBuffer: async () => bytes.buffer };
}

describe('decodeBuffer', () => {
  it('decodes plain utf-8', () => {
    expect(decodeBuffer(enc('Tiếng Việt').buffer)).toBe('Tiếng Việt');
  });

  it('strips a utf-8 BOM', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('abc')]);
    expect(decodeBuffer(withBom.buffer)).toBe('abc');
  });

  it('decodes utf-16le', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
    expect(decodeBuffer(bytes.buffer)).toBe('ab');
  });
});

describe('parseCSVText', () => {
  it('parses rows and nulls', () => {
    const { rows } = parseCSVText('a,b\n1,2\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('file type helpers', () => {
  it('classifies extensions', () => {
    expect(fileExtension('data.XLSX')).toBe('xlsx');
    expect(isExcelFile({ name: 'a.xlsx' })).toBe(true);
    expect(isCsvLikeFile({ name: 'a.csv' })).toBe(true);
    expect(isCsvLikeFile({ name: 'a.xlsx' })).toBe(false);
  });
});

describe('readFile', () => {
  it('reads a csv file into rows', async () => {
    const out = await readFile(fakeFile('data.csv', enc('cột a,cột b\n1,2\n')));
    expect(out.kind).toBe('csv');
    expect(out.sheets[0].rows[0]).toEqual(['cột a', 'cột b']);
  });

  it('reads an xlsx workbook into sheets', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['A', 'B'], ['1', '2']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const out = await readFile(fakeFile('book.xlsx', array));
    expect(out.kind).toBe('excel');
    expect(out.sheets).toHaveLength(1);
    expect(out.sheets[0].name).toBe('Sheet1');
    expect(out.sheets[0].rows[0]).toEqual(['A', 'B']);
  });

  it('rejects unsupported extensions', async () => {
    await expect(readFile(fakeFile('image.png', new Uint8Array([1, 2, 3])))).rejects.toThrow(
      /chưa được hỗ trợ/
    );
  });
});
