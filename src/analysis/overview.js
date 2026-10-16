import { CHOICE_TYPES, QTYPE, GRID_TYPES } from '../core/constants.js';
import { getColumn, includedColumns } from '../core/model.js';
import { toDateKey, responseDateAt } from '../core/dates.js';
import { buildQuestionGroups, analyzeGroup, overallCompletion } from './analyze.js';

export function buildTimeline(dataset, responses, opts = {}) {
  const dayFirst = opts.dayFirst ?? (dataset.dateMeta?.dayFirst !== false);
  const tsCol = dataset.timestampColumn ? getColumn(dataset, dataset.timestampColumn) : null;
  const byDay = new Map();
  let withTimestamp = 0;
  for (const r of responses) {
    let key = null;
    if (r.submittedAt) {
      key = toDateKey(new Date(r.submittedAt));
      withTimestamp += 1;
    } else if (tsCol) {
      const d = responseDateAt(r, tsCol.id, dayFirst);
      if (d) {
        key = toDateKey(d);
        withTimestamp += 1;
      }
    }
    if (key) byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const points = [...byDay.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));
  let running = 0;
  const cumulative = points.map((p) => {
    running += p.count;
    return { key: p.key, count: running };
  });
  return { points, cumulative, hasTimeline: !!tsCol || withTimestamp > 0, withTimestamp };
}

export function buildOverview(dataset, responses, opts = {}) {
  const dayFirst = opts.dayFirst ?? (dataset.dateMeta?.dayFirst !== false);
  const groups = buildQuestionGroups(dataset);
  const completion = overallCompletion(dataset, responses);

  let busiestOption = null;
  const choicesSummary = [];
  for (const group of groups) {
    const col = group.columns[0];
    const isChoice = group.gridBase || CHOICE_TYPES.has(col.type);
    if (!isChoice) continue;
    const analyzed = analyzeGroup(group, responses, { dayFirst });
    if (analyzed.kind === 'categorical') {
      if (analyzed.categories[0]) {
        const top = analyzed.categories[0];
        choicesSummary.push({ question: group.title, option: top.value, count: top.count, pct: top.pct });
        if (!busiestOption || top.count > busiestOption.count) {
          busiestOption = { question: group.title, option: top.value, count: top.count, pct: top.pct };
        }
      }
    } else if (analyzed.kind === 'grid') {
      if (analyzed.choices[0]) {
        const top = analyzed.choices[0];
        choicesSummary.push({ question: group.title, option: top.value, count: top.count, pct: null });
      }
    }
  }
  choicesSummary.sort((a, b) => b.count - a.count);

  const included = includedColumns(dataset);
  const timestampCol = dataset.timestampColumn ? getColumn(dataset, dataset.timestampColumn) : null;

  return {
    totalResponses: responses.length,
    totalQuestions: groups.length,
    totalColumns: included.length,
    completion,
    timeline: buildTimeline(dataset, responses, { dayFirst }),
    busiestOption,
    choicesSummary: choicesSummary.slice(0, 8),
    responseIdConfigured: !!dataset.responseIdColumn,
    timestampConfigured: !!timestampCol,
    sync: dataset.sync || null,
    source: dataset.source || null,
    gridCount: included.filter((c) => GRID_TYPES.has(c.type)).length,
    unknownCount: included.filter((c) => c.type === QTYPE.UNKNOWN).length,
  };
}
