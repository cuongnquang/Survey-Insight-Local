import * as XLSX from 'xlsx';
import { buildQuestionGroups, analyzeGroup } from '../analysis/analyze.js';
import { buildOverview } from '../analysis/overview.js';
import { QTYPE_LABEL } from '../core/constants.js';
import { includedColumns, toDisplayString } from '../core/model.js';
import { formatDateTime } from '../utils/format.js';

export function buildWorkbook({ dataset, responses, filterSummary = 'Toàn bộ dữ liệu', includeData = true }) {
  const wb = XLSX.utils.book_new();
  const overview = buildOverview(dataset, responses);

  const overviewRows = [
    ['Survey Insight Local — Báo cáo khảo sát'],
    [],
    ['Tên khảo sát', dataset.name || ''],
    ['Nguồn dữ liệu', dataset.source?.type === 'sheets' ? 'Google Sheets' : dataset.source?.fileName || ''],
    ['Sheet', dataset.source?.sheetName || ''],
    ['Bộ lọc', filterSummary],
    ['Tạo lúc', formatDateTime(Date.now())],
    [],
    ['Chỉ số', 'Giá trị'],
    ['Tổng số phản hồi', overview.totalResponses],
    ['Số câu hỏi', overview.totalQuestions],
    ['Tỷ lệ hoàn thành trung bình (%)', overview.completion.avgAnsweredPercent],
    ['Phản hồi hoàn thành toàn bộ', overview.completion.fullyCompleted],
    ['Tỷ lệ hoàn thành toàn bộ (%)', overview.completion.fullyCompletedPercent],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview['!cols'] = [{ wch: 34 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Tổng quan');

  const qRows = [
    ['#', 'Câu hỏi', 'Loại', 'Giá trị / Đáp án', 'Số lượng', 'Tỷ lệ %', 'Hợp lệ', 'Trống', 'Không hợp lệ'],
  ];
  const groups = buildQuestionGroups(dataset);
  groups.forEach((group, gi) => {
    const analysis = analyzeGroup(group, responses, { dayFirst: dataset.dateMeta?.dayFirst !== false });
    const typeLabel = group.gridBase ? 'Câu hỏi lưới' : QTYPE_LABEL[group.columns[0].type] || 'Không xác định';
    if (analysis.kind === 'grid') {
      analysis.rows.forEach((row, ri) => {
        row.categories.forEach((cat) => {
          qRows.push([
            ri === 0 ? gi + 1 : '',
            ri === 0 ? group.title : '',
            ri === 0 ? typeLabel : '',
            `${row.inner} › ${cat.value}`,
            cat.count,
            cat.pct,
            row.valid,
            row.blank,
            '',
          ]);
        });
      });
      return;
    }
    const valid = analysis.valid;
    const blank = analysis.blank;
    const invalid = analysis.invalid ?? '';
    let cats = analysis.categories;
    if (!cats) {
      if (analysis.kind === 'scale') cats = analysis.distribution.map((d) => ({ value: String(d.value), count: d.count, pct: d.pct }));
      else if (analysis.kind === 'date') cats = analysis.byDay.map((d) => ({ value: d.key, count: d.count, pct: '' }));
      else if (analysis.kind === 'time') cats = analysis.byHour.filter((h) => h.count).map((h) => ({ value: `${h.hour}h`, count: h.count, pct: '' }));
      else cats = analysis.keywords.map((k) => ({ value: k.word, count: k.count, pct: '' }));
    }
    cats.forEach((cat, ci) => {
      qRows.push([
        ci === 0 ? gi + 1 : '',
        ci === 0 ? group.title : '',
        ci === 0 ? typeLabel : '',
        cat.value,
        cat.count,
        cat.pct,
        ci === 0 ? valid : '',
        ci === 0 ? blank : '',
        ci === 0 ? invalid : '',
      ]);
    });
  });
  const wsQuestions = XLSX.utils.aoa_to_sheet(qRows);
  wsQuestions['!cols'] = [
    { wch: 4 }, { wch: 40 }, { wch: 22 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsQuestions, 'Theo câu hỏi');

  if (includeData) {
    const cols = includedColumns(dataset);
    const header = ['#', ...cols.map((c) => c.name || c.header)];
    const rows = responses.map((r, i) => [i + 1, ...cols.map((c) => toDisplayString(r.values[c.id]))]);
    const wsData = XLSX.utils.aoa_to_sheet([header, ...rows]);
    wsData['!cols'] = header.map((hh) => ({ wch: Math.min(40, Math.max(12, String(hh).length + 4)) }));
    XLSX.utils.book_append_sheet(wb, wsData, 'Dữ liệu phản hồi');
  }

  return wb;
}

export function exportExcel(options) {
  const wb = buildWorkbook(options);
  const name = safeName(options.dataset.name) + '-bao-cao.xlsx';
  XLSX.writeFile(wb, name);
  return name;
}

function safeName(name) {
  return String(name || 'khao-sat')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
