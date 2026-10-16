import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export function decodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseCSVText(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const result = Papa.parse(clean, {
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  const rows = (result.data || []).map((row) => row.map((c) => (c == null ? null : c)));
  return { rows, warnings: result.errors || [] };
}

export function fileExtension(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

export function isExcelFile(file) {
  const ext = fileExtension(file.name);
  return ['xlsx', 'xls', 'xlsm', 'ods', 'xlsb'].includes(ext);
}

export function isCsvLikeFile(file) {
  const ext = fileExtension(file.name);
  return ['csv', 'tsv', 'txt'].includes(ext);
}

export function readExcelWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    return { name, rows };
  });
  return { sheets };
}

export async function readFile(file) {
  const name = file.name || '';
  if (isExcelFile(file)) {
    const buffer = await file.arrayBuffer();
    const wb = readExcelWorkbook(buffer);
    return { kind: 'excel', fileName: name, sheets: wb.sheets };
  }
  if (isCsvLikeFile(file)) {
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    const parsed = parseCSVText(text);
    return {
      kind: 'csv',
      fileName: name,
      sheets: [{ name: 'CSV', rows: parsed.rows }],
      warnings: parsed.warnings,
    };
  }
  throw new Error(`Định dạng tệp chưa được hỗ trợ: ${name}`);
}

export function sheetToMatrix(sheet) {
  return sheet?.rows || [];
}
