export const QTYPE = {
  SHORT_TEXT: 'short_text',
  PARAGRAPH: 'paragraph',
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'multiple_choice',
  DROPDOWN: 'dropdown',
  YES_NO: 'yes_no',
  LINEAR_SCALE: 'linear_scale',
  RATING: 'rating',
  DATE: 'date',
  TIME: 'time',
  GRID_SINGLE: 'grid_single',
  GRID_MULTIPLE: 'grid_multi',
  UNKNOWN: 'unknown',
};

export const QTYPE_LABEL = {
  short_text: 'Trả lời ngắn',
  paragraph: 'Đoạn văn',
  single_choice: 'Trắc nghiệm (một lựa chọn)',
  multiple_choice: 'Checkbox (nhiều lựa chọn)',
  dropdown: 'Danh sách thả xuống',
  yes_no: 'Có / Không',
  linear_scale: 'Thang tuyến tính',
  rating: 'Đánh giá (sao/điểm)',
  date: 'Ngày tháng',
  time: 'Thời gian',
  grid_single: 'Lưới trắc nghiệm',
  grid_multi: 'Lưới checkbox',
  unknown: 'Chưa xác định',
};

export const CHOICE_TYPES = new Set([
  QTYPE.SINGLE_CHOICE,
  QTYPE.MULTIPLE_CHOICE,
  QTYPE.DROPDOWN,
  QTYPE.YES_NO,
]);

export const TEXT_TYPES = new Set([QTYPE.SHORT_TEXT, QTYPE.PARAGRAPH, QTYPE.UNKNOWN]);

export const SCALE_TYPES = new Set([QTYPE.LINEAR_SCALE, QTYPE.RATING]);

export const GRID_TYPES = new Set([QTYPE.GRID_SINGLE, QTYPE.GRID_MULTIPLE]);

export const SEPARATORS = {
  comma: ',',
  semicolon: ';',
  newline: '\n',
  pipe: '|',
  tab: '\t',
};

export const SEPARATOR_LABEL = {
  comma: 'Dấu phẩy ( , )',
  semicolon: 'Dấu chấm phẩy ( ; )',
  newline: 'Xuống dòng',
  pipe: 'Dấu sổ thẳng ( | )',
  tab: 'Tab',
  custom: 'Tùy chỉnh',
};

export const CHART = {
  BAR: 'bar',
  BAR_HORIZONTAL: 'barH',
  PIE: 'pie',
  DOUGHNUT: 'doughnut',
  LINE: 'line',
  HISTOGRAM: 'histogram',
  MATRIX: 'matrix',
  TABLE: 'table',
  NONE: 'none',
};

export const STORAGE_KEYS = {
  SETTINGS: 'sil:settings',
  ACTIVE_DATASET: 'sil:activeDataset',
};

export const DB_NAME = 'survey-insight-local';
export const DB_VERSION = 1;
