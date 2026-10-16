import { jsPDF } from 'jspdf';
import { buildQuestionGroups, analyzeGroup } from '../analysis/analyze.js';
import { buildOverview } from '../analysis/overview.js';
import { chooseChart, buildChartSpec, renderSpecToImage } from '../charts/renderer.js';
import { QTYPE_LABEL } from '../core/constants.js';
import { formatInt, formatNum, formatDateTime, formatPercent } from '../utils/format.js';

const BASE_URL = (import.meta.env && import.meta.env.BASE_URL) || './';
const FONT_URL = `${BASE_URL}fonts/Roboto-400Regular.ttf`;
const FONT_BOLD_URL = `${BASE_URL}fonts/Roboto-700Bold.ttf`;
const FONT_NAME = 'Roboto';
const FONT_BOLD = 'RobotoBold';

let fontReady = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontBase64(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được font ${label} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength === 0) throw new Error(`Tệp font ${label} rỗng`);
  return arrayBufferToBase64(buf);
}

// Font là tài nguyên đi kèm ứng dụng, không tải từ mạng. Nếu thiếu font,
// ném lỗi rõ ràng thay vì âm thầm rơi về helvetica (mất dấu tiếng Việt).
export async function ensurePdfFont(doc) {
  if (!fontReady) {
    fontReady = (async () => {
      const [regular, bold] = await Promise.all([
        loadFontBase64(FONT_URL, 'Roboto Regular'),
        loadFontBase64(FONT_BOLD_URL, 'Roboto Bold'),
      ]);
      return { regular, bold };
    })().catch((err) => {
      fontReady = null;
      throw new Error(
        `Không nạp được font để xuất PDF. Hãy chắc chắn tệp font có trong thư mục public/fonts. Chi tiết: ${err.message}`
      );
    });
  }
  const fonts = await fontReady;
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
  doc.addFont('Roboto-Regular.ttf', FONT_NAME, 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', fonts.bold);
  doc.addFont('Roboto-Bold.ttf', FONT_BOLD, 'bold');
  doc.setFont(FONT_NAME);
  return { font: FONT_NAME, bold: FONT_BOLD, unicode: true };
}

function categoryRows(analysis) {
  if (analysis.kind === 'categorical') {
    return analysis.categories.map((c) => [c.value, formatInt(c.count), formatPercent(c.pct)]);
  }
  if (analysis.kind === 'scale') {
    return analysis.distribution.map((d) => [String(d.value), formatInt(d.count), formatPercent(d.pct)]);
  }
  if (analysis.kind === 'date') {
    return analysis.byDay.map((d) => [d.key, formatInt(d.count), '']);
  }
  if (analysis.kind === 'time') {
    return analysis.byHour.filter((h) => h.count > 0).map((h) => [`${String(h.hour).padStart(2, '0')}:00`, formatInt(h.count), '']);
  }
  if (analysis.kind === 'grid') {
    return analysis.rows.map((r) => [
      r.inner,
      ...analysis.choices.slice(0, 6).map((ch) => {
        const found = r.categories.find((c) => c.value === ch.value);
        return found ? formatInt(found.count) : '0';
      }),
    ]);
  }
  return [];
}

export function reportTableHead(analysis) {
  if (analysis.kind === 'grid') {
    return ['Hàng', ...analysis.choices.slice(0, 6).map((c) => c.value)];
  }
  return ['Giá trị', 'Số lượng', 'Tỷ lệ'];
}

export async function generateReportPdf({
  dataset,
  responses,
  selection,
  title = 'Báo cáo khảo sát',
  filterSummary = 'Toàn bộ dữ liệu',
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fonts = await ensurePdfFont(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const setFont = (bold, size) => {
    doc.setFont(bold ? fonts.bold : fonts.font, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };

  const ensureSpace = (needed) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text, size, bold, color = [16, 27, 33]) => {
    setFont(bold, size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), contentW);
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
  };

  // Header band
  doc.setFillColor(18, 82, 95);
  doc.rect(0, 0, pageW, 68, 'F');
  doc.setTextColor(255, 255, 255);
  setFont(true, 20);
  const brandW = 150;
  const titleLines = doc.splitTextToSize(String(title), contentW - brandW).slice(0, 2);
  const titleBlockH = titleLines.length * 22;
  let titleY = 34 - (titleBlockH - 22) / 2 + 14;
  for (const line of titleLines) {
    doc.text(line, margin, titleY);
    titleY += 22;
  }
  setFont(false, 10);
  doc.text('Survey Insight Local', pageW - margin, 42, { align: 'right' });
  y = 96;

  writeWrapped(dataset.name || 'Khảo sát', 16, true);
  y += 2;
  writeWrapped(`Nguồn dữ liệu: ${sourceLabel(dataset.source)}`, 10, false, [100, 117, 126]);
  writeWrapped(`Bộ lọc: ${filterSummary}`, 10, false, [100, 117, 126]);
  writeWrapped(`Tạo lúc: ${formatDateTime(Date.now())}`, 10, false, [100, 117, 126]);

  const overview = buildOverview(dataset, responses);
  y += 8;
  ensureSpace(60);
  setFont(true, 13);
  doc.setTextColor(16, 27, 33);
  doc.text('Chỉ số tổng quan', margin, y);
  y += 18;
  const kpis = [
    ['Tổng số phản hồi', formatInt(overview.totalResponses)],
    ['Số câu hỏi', formatInt(overview.totalQuestions)],
    ['Tỷ lệ hoàn thành trung bình', formatPercent(overview.completion.avgAnsweredPercent)],
    ['Hoàn thành toàn bộ', formatPercent(overview.completion.fullyCompletedPercent)],
  ];
  const colW = contentW / 2;
  kpis.forEach((kpi, i) => {
    const col = i % 2;
    if (col === 0) ensureSpace(34);
    const x = margin + col * colW;
    setFont(false, 9);
    doc.setTextColor(100, 117, 126);
    doc.text(kpi[0], x, y);
    setFont(true, 14);
    doc.setTextColor(16, 27, 33);
    doc.text(kpi[1], x, y + 15);
    if (col === 1 || i === kpis.length - 1) y += 34;
  });

  const groups = buildQuestionGroups(dataset).filter((g) => selection.has(g.id));
  const list = groups.length ? groups : buildQuestionGroups(dataset);

  for (let idx = 0; idx < list.length; idx += 1) {
    const group = list[idx];
    const analysis = analyzeGroup(group, responses, { dayFirst: dataset.dateMeta?.dayFirst !== false });
    doc.addPage();
    y = margin;

    writeWrapped(`${idx + 1}. ${group.title}`, 13, true);
    const typeLabel = group.gridBase ? 'Câu hỏi lưới' : QTYPE_LABEL[group.columns[0].type] || 'Không xác định';
    writeWrapped(`Loại: ${typeLabel}`, 9, false, [100, 117, 126]);
    y += 4;

    if (analysis.kind === 'scale') {
      writeWrapped(
        `Hợp lệ: ${formatInt(analysis.valid)} · Trống: ${formatInt(analysis.blank)} · Không hợp lệ: ${formatInt(
          analysis.invalid
        )} · Trung bình: ${formatNum(analysis.mean)} · Trung vị: ${formatNum(analysis.median)} · Thấp nhất: ${
          analysis.min ?? '—'
        } · Cao nhất: ${analysis.max ?? '—'}`,
        9,
        false,
        [61, 79, 88]
      );
    } else {
      writeWrapped(
        `Tổng: ${formatInt(analysis.total)} · Hợp lệ: ${formatInt(analysis.valid)} · Trống: ${formatInt(analysis.blank)}`,
        9,
        false,
        [61, 79, 88]
      );
    }
    if (analysis.note) writeWrapped(analysis.note, 8, false, [180, 121, 31]);
    y += 8;

    const spec = buildChartSpec(analysis, chooseChart(analysis));
    if (spec && analysis.categories?.length !== 0) {
      try {
        const img = await renderSpecToImage(spec, { width: 720, height: 380, scale: 2 });
        const imgW = contentW;
        const imgH = imgW * (380 / 720);
        ensureSpace(imgH + 10);
        doc.addImage(img, 'PNG', margin, y, imgW, imgH);
        y += imgH + 12;
      } catch (err) {
        console.warn('chart to image failed', err);
      }
    }

    const head = reportTableHead(analysis);
    const rows = categoryRows(analysis);
    if (rows.length) {
      y = drawTable(doc, { x: margin, y, width: contentW, head, rows, ensureSpace, setFont, pageH, margin });
    }
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    setFont(false, 8);
    doc.setTextColor(150, 165, 172);
    doc.text(`Trang ${p}/${pageCount}`, pageW - margin, pageH - 20, { align: 'right' });
    doc.text('Dữ liệu được tạo cục bộ bởi Survey Insight Local', margin, pageH - 20);
  }

  doc.save(safeName(dataset.name) + '-bao-cao.pdf');
  return { ok: true, unicode: true };
}

function drawTable(doc, { x, y, width, head, rows, ensureSpace, setFont, pageH, margin }) {
  const colCount = head.length;
  const firstW = width * (colCount > 3 ? 0.42 : 0.55);
  const otherW = (width - firstW) / (colCount - 1);
  const widths = [firstW, ...Array(colCount - 1).fill(otherW)];
  const rowH = 16;

  const drawHead = () => {
    ensureSpace(rowH + 4);
    doc.setFillColor(241, 244, 246);
    doc.rect(x, y, width, rowH, 'F');
    setFont(true, 9);
    doc.setTextColor(16, 27, 33);
    let cx = x + 4;
    head.forEach((h, i) => {
      doc.text(String(h), cx, y + 11, { maxWidth: widths[i] - 6 });
      cx += widths[i];
    });
    y += rowH;
  };

  drawHead();
  setFont(false, 9);
  doc.setTextColor(40, 55, 63);
  for (const row of rows) {
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHead();
      setFont(false, 9);
      doc.setTextColor(40, 55, 63);
    }
    let cx = x + 4;
    row.forEach((cell, i) => {
      const text = doc.splitTextToSize(String(cell ?? ''), widths[i] - 6)[0] || '';
      doc.text(text, cx, y + 11);
      cx += widths[i];
    });
    doc.setDrawColor(207, 216, 221);
    doc.line(x, y + rowH, x + width, y + rowH);
    y += rowH;
  }
  return y + 8;
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

function sourceLabel(source) {
  if (!source) return 'Không rõ';
  if (source.type === 'sheets') return `Google Sheets — ${source.sheetName || ''} ${source.spreadsheetId ? `(${source.spreadsheetId.slice(0, 12)}…)` : ''}`;
  return `Tệp ${source.fileName || ''}${source.sheetName ? ` — sheet ${source.sheetName}` : ''}`;
}
